-- ═══════════════════════════════════════════════════════════════════════════
--  Inventory deduction otomatis saat order CONFIRMED (F-011, TC-AC6, #9)
--
--  Trigger AFTER UPDATE OF status ON orders:
--   - saat status berubah → 'CONFIRMED' (dan sebelumnya bukan CONFIRMED),
--     kurangi stok via product_bom (BOM) + catat inventory_logs(type='deduction').
--   - RAISE EXCEPTION bila stok kurang → seluruh transaksi update status
--     di-ABORT (atomic; order tetap pada status sebelumnya).
--   - Idempoten: guard OLD.status <> 'CONFIRMED' mencegah deduksi ganda.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION coffibeshop_deduct_inventory_on_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  rec RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND (OLD.status IS DISTINCT FROM 'CONFIRMED') THEN
    FOR rec IN
      SELECT pb.inventory_item_id,
             ii.name,
             ii.unit,
             ii.quantity AS current_qty,
             SUM(pb.quantity * oi.qty) AS needed
      FROM order_items oi
      JOIN product_bom pb ON pb.product_id = oi.product_id
      JOIN inventory_items ii ON ii.id = pb.inventory_item_id
      WHERE oi.order_id = NEW.id
      GROUP BY pb.inventory_item_id, ii.name, ii.unit, ii.quantity
    LOOP
      IF rec.current_qty < rec.needed THEN
        RAISE EXCEPTION 'Stok % tidak mencukupi (tersedia: %, butuh: %)',
          rec.name, rec.current_qty, rec.needed
          USING ERRCODE = 'check_violation';
      END IF;

      UPDATE inventory_items
         SET quantity = quantity - rec.needed,
             updated_at = NOW()
       WHERE id = rec.inventory_item_id;

      INSERT INTO inventory_logs (id, outlet_id, inventory_item_id, order_id, type, quantity, unit, note)
      VALUES (gen_random_uuid(), NEW.outlet_id, rec.inventory_item_id, NEW.id,
              'deduction', rec.needed, rec.unit,
              'Deduksi otomatis (order ' || NEW.order_number || ')');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_deduct_inventory ON orders;
CREATE TRIGGER trg_orders_deduct_inventory
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION coffibeshop_deduct_inventory_on_confirmed();

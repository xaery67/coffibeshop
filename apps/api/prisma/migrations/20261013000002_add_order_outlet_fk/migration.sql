-- AddForeignKey (issue #68 PR-B): relasi Order.outlet -> Outlet
-- Ditambahkan oleh orkestrator: schema.prisma di PR #69 menambah relasi `outlet`
-- pada model Order, tetapi file migration-nya belum ada -> CI drift gate gagal
-- ("[+] Added foreign key on columns (outlet_id)"). Data live terverifikasi
-- bebas orphan (outlet_id NULL atau valid), sehingga FK ini aman.
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

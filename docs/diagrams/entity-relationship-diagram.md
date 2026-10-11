# Entity Relationship Diagram (ERD) - CoffeeShop Online

> Model data untuk platform pesanan online coffeeshop dengan administrasi otomatis.

## Notasi
- Entitas digambarkan sebagai tabel dengan atribut.
- Primary Key ditandai dengan **(PK)**.
- Foreign Key ditandai dengan **(FK)**.
- Relationship: 1:1, 1:N, N:M.

---

## ERD Textual Diagram

```
+----------------+       +------------------+       +------------------+
|   users        |       |  outlets         |       |  categories      |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| email          |       | name             |       | name             |
| phone          |       | code             |       | description      |
| password_hash  |       | address          |       | sort_order       |
| full_name      |       | phone            |       | is_active        |
| role (enum)    |       | email            |       | created_at       |
| is_active      |       | opening_hours    |       +------------------+
| created_at     |       | is_active        |
+----------------+       | created_at       |
         |               +------------------+
         | 1:N                    | 1:N
         |                        |
         v                        v
+----------------+       +------------------+
|  customers     |       |  products        |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       |  product_variants|
| user_id (FK)   |       | outlet_id (FK)   |       +------------------+
| loyalty_tier   |       | category_id (FK) |       | id (PK)          |
| total_points   |       | name             |       | product_id (FK)  |
| birth_date     |       | description      |       | name             |
| preferences    |       | base_price       |       | sku              |
| created_at     |       | image_url        |       | price_adjustment |
+----------------+       | is_available     |       | stock_quantity   |
         |               | is_active        |       | is_active        |
         |               | created_at       |       | created_at       |
         |               +------------------+       +------------------+
         |                        | 1:N                      | 1:N
         |                        |                          |
         v                        v                          v
+----------------+       +------------------+       +------------------+
|  addresses     |       |  product_options |       | order_items      |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| customer_id(FK)|       | product_id (FK)  |       | order_id (FK)    |
| label          |       | name             |       | product_id (FK)  |
| full_address   |       | option_type      |       | variant_id (FK)  |
| latitude       |       | min_select       |       | quantity         |
| longitude      |       | max_select       |       | unit_price       |
| is_default     |       | is_required      |       | subtotal         |
| created_at     |       | created_at       |       | customizations   |
+----------------+       +------------------+       +------------------+
         |                        | 1:N                      | N:1
         |                        |                          |
         v                        v                          v
+----------------+       +------------------+       +------------------+
|  option_values |       |  orders          |       |  payments        |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| option_id (FK) |       | customer_id (FK)|       | order_id (FK)    |
| value          |       | outlet_id (FK)   |       | amount           |
| price_adjustment|      | order_number     |       | payment_method   |
| stock_code     |       | fulfillment_type |       | transaction_id   |
| created_at     |       | status           |       | status           |
+----------------+       | total_amount     |       | paid_at          |
         |               | tax_amount       |       | created_at       |
         |               | discount_amount  |       +------------------+
         |               | points_used      |
         |               | delivery_fee     |
         |               | pickup_time      |
         |               | table_number     |
         |               | note             |
         |               | created_at       |
         |               +------------------+
         |                         | 1:N
         |                         |
         v                         v
+----------------+       +------------------+       +------------------+
| order_item_options|    |  order_status_logs|      |  vouchers        |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| order_item_id  |       | order_id (FK)    |       | code             |
| option_value_id|       | status           |       | description      |
| quantity       |       | note             |       | discount_type    |
| price          |       | created_by       |       | discount_value   |
| created_at     |       | created_at       |       | min_purchase     |
+----------------+       +------------------+       | max_discount     |
                                                      | usage_limit      |
                                                      | used_count       |
                                                      | start_date       |
                                                      | end_date         |
                                                      | is_active        |
                                                      +------------------+

+----------------+       +------------------+       +------------------+
|  loyalty_points |       |  loyalty_tiers   |       |  reviews         |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| customer_id(FK)|       | name             |       | order_id (FK)    |
| order_id (FK)  |       | min_points       |       | customer_id(FK)  |
| points_earned    |       | discount_pct     |       | rating           |
| points_redeemed  |       | benefits         |       | comment          |
| balance          |       | created_at       |       | created_at       |
| expiry_date      |       +------------------+       +------------------+
| created_at       |
+------------------+

+----------------+       +------------------+       +------------------+
|  inventory_items|       |  inventory_logs  |       |  suppliers       |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| outlet_id (FK) |       | inventory_item_id|       | name             |
| name           |       | type             |       | contact          |
| unit           |       | quantity         |       | email            |
| reorder_point  |       | reference_type   |       | phone            |
| current_stock  |       | reference_id     |       | address          |
| unit_cost      |       | note             |       | is_active        |
| supplier_id(FK)|      | created_at       |       | created_at       |
| created_at     |       +------------------+       +------------------+
+------------------+

+----------------+       +------------------+       +------------------+
|  product_bom   |       |  daily_sales     |       |  monthly_reports |
+----------------+       +------------------+       +------------------+
| id (PK)        |       | id (PK)          |       | id (PK)          |
| product_id(FK) |       | outlet_id (FK)   |       | outlet_id (FK)   |
| inventory_item_id|     | date             |       | month            |
| quantity_used  |       | total_orders     |       | year             |
| created_at     |       | total_revenue    |       | total_revenue    |
+----------------+       | total_tax        |       | total_cogs       |
                         | total_discount   |       | gross_profit     |
                         | total_profit     |       | net_profit       |
                         | created_at       |       | expenses         |
                         +------------------+       | created_at       |
                                                  +------------------+
```

---

## Catatan Desain
- Setiap `order` memiliki satu `payment`, namun satu order bisa memiliki banyak `order_status_logs`.
- `order_items` menyimpan snapshot harga dan kustomisasi agar historis akurat.
- `product_bom` digunakan untuk mengurangi stok bahan baku otomatis saat pesanan completed.
- `daily_sales` dan `monthly_reports` merupakan tabel agregat untuk mempercepat laporan dan mengurangi query berat.
- `loyalty_points` mencatat transaksi poin (earn/redeem) seperti buku tabungan.

---

## Indeks Penting
- `users.email` (UNIQUE)
- `users.phone` (UNIQUE)
- `orders.order_number` (UNIQUE)
- `products.category_id`, `products.outlet_id`
- `orders.customer_id`, `orders.outlet_id`, `orders.created_at`
- `payments.transaction_id`
- `inventory_logs.inventory_item_id`, `inventory_logs.created_at`

---

*Untuk versi visual Mermaid, lihat file `system-architecture.md` dan class diagram di `class-diagram.md`.*

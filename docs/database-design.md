# Database Design - CoffeeShop Online

> Desain database cloud untuk platform pesanan online coffeeshop dengan otomatisasi administrasi bulanan.

## 1. Teknologi Database

### 1.1 Pilihan Utama: PostgreSQL di Cloud
Kami memilih **PostgreSQL** sebagai database utama karena:
- Mendukung transaksi **ACID** untuk pesanan dan pembayaran.
- Kemampuan query relasional yang kuat untuk laporan.
- Dukungan **JSONB** untuk data fleksibel seperti customizations dan preferences.
- Banyak layanan cloud managed (Supabase, AWS RDS, GCP Cloud SQL, Azure Database).
- Ekstensi untuk full-text search (pg_trgm) dan geolokasi (PostGIS).

### 1.2 Layanan Cloud Rekomendasi

| Kebutuhan | Rekomendasi | Catatan |
|-----------|-------------|---------|
| MVP / Small | **Supabase** | PostgreSQL + Auth + Storage + Realtime dalam satu platform. Harga terjangkau. |
| Medium / Growth | **AWS RDS PostgreSQL** atau **Cloud SQL** | Skalabilitas lebih tinggi, monitoring lengkap. |
| Enterprise | **AWS Aurora PostgreSQL** | Auto-scaling, high availability, performa tinggi. |
| Cache | **Redis** / Upstash | Session, cart sementara, rate limiting. |
| File Storage | **Supabase Storage** / **AWS S3** / **Cloudflare R2** | Foto produk, struk, laporan. |
| Queue | **BullMQ (Redis)** / **AWS SQS** / **RabbitMQ** | Webhook payment, notifikasi async. |

### 1.3 Skema Database
Semua tabel berada dalam satu database `coffeeshop` dengan skema `public` dan `reporting`.

---

## 2. Definisi Tabel

### 2.1 Tabel `users`
Menyimpan data autentikasi dan profil pengguna.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'customer', -- customer, staff, manager, owner, admin
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 Tabel `customers`
Data pelanggan terdaftar.

```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    loyalty_tier_id UUID REFERENCES loyalty_tiers(id),
    total_points INTEGER DEFAULT 0,
    birth_date DATE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 Tabel `addresses`
Alamat pelanggan untuk delivery.

```sql
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label VARCHAR(100),
    full_address TEXT NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 Tabel `outlets`
Data cabang/outlet coffeeshop.

```sql
CREATE TABLE outlets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    opening_hours JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 Tabel `categories`
Kategori produk.

```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.6 Tabel `products`
Master produk.

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.7 Tabel `product_variants`
Varian produk seperti ukuran.

```sql
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g., Small, Medium, Large
    sku VARCHAR(100),
    price_adjustment DECIMAL(12,2) DEFAULT 0,
    stock_quantity INTEGER DEFAULT NULL, -- NULL = unlimited/track by BOM
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.8 Tabel `product_options`
Opsi tambahan seperti susu, gula, sirup.

```sql
CREATE TABLE product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g., Milk Type, Sugar Level
    option_type VARCHAR(50), -- single, multiple
    min_select INTEGER DEFAULT 0,
    max_select INTEGER DEFAULT 1,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.9 Tabel `option_values`
Nilai pilihan opsi.

```sql
CREATE TABLE option_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id UUID NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
    value VARCHAR(255) NOT NULL, -- e.g., Oat Milk, Less Sugar
    price_adjustment DECIMAL(12,2) DEFAULT 0,
    stock_code VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.10 Tabel `carts`
Keranjang belanja.

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    session_id VARCHAR(255), -- untuk guest
    total_amount DECIMAL(12,2) DEFAULT 0,
    voucher_id UUID REFERENCES vouchers(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.11 Tabel `cart_items`
Item dalam keranjang.

```sql
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    selected_options JSONB DEFAULT '[]',
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.12 Tabel `orders`
Pesanan utama.

```sql
CREATE TYPE order_status AS ENUM ('pending','paid','confirmed','being_prepared','ready','completed','cancelled');
CREATE TYPE fulfillment_type AS ENUM ('dine_in','takeaway','pickup','delivery');

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    fulfillment_type fulfillment_type NOT NULL,
    status order_status NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    points_used INTEGER DEFAULT 0,
    delivery_fee DECIMAL(12,2) DEFAULT 0,
    pickup_time TIMESTAMPTZ,
    table_number VARCHAR(20),
    note TEXT,
    voucher_id UUID REFERENCES vouchers(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.13 Tabel `order_items`
Item pesanan (snapshot harga).

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    customizations JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.14 Tabel `order_item_options`
Opsi yang dipilih per item pesanan.

```sql
CREATE TABLE order_item_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    option_value_id UUID NOT NULL REFERENCES option_values(id),
    quantity INTEGER DEFAULT 1,
    price DECIMAL(12,2) DEFAULT 0
);
```

### 2.15 Tabel `order_status_logs`
Log perubahan status pesanan.

```sql
CREATE TABLE order_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status order_status NOT NULL,
    note TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.16 Tabel `payments`
Data pembayaran.

```sql
CREATE TYPE payment_method AS ENUM ('qris','gopay','ovo','dana','linkaja','shopeepay','virtual_account','credit_card','debit_card','apple_pay','google_pay','cash');
CREATE TYPE payment_status AS ENUM ('pending','success','failed','refunded','expired');

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    amount DECIMAL(12,2) NOT NULL,
    payment_method payment_method NOT NULL,
    transaction_id VARCHAR(255),
    status payment_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.17 Tabel `vouchers`
Voucher dan promo.

```sql
CREATE TYPE discount_type AS ENUM ('percentage','fixed_amount');

CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    discount_type discount_type NOT NULL,
    discount_value DECIMAL(12,2) NOT NULL,
    min_purchase DECIMAL(12,2) DEFAULT 0,
    max_discount DECIMAL(12,2),
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.18 Tabel `loyalty_tiers`
Tier loyalitas.

```sql
CREATE TABLE loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL, -- Bronze, Silver, Gold, Platinum
    min_points INTEGER NOT NULL DEFAULT 0,
    discount_pct DECIMAL(5,2) DEFAULT 0,
    benefits JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.19 Tabel `loyalty_points`
Riwayat poin.

```sql
CREATE TABLE loyalty_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    balance INTEGER DEFAULT 0,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.20 Tabel `reviews`
Rating dan ulasan.

```sql
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.21 Tabel `suppliers`
Data supplier bahan baku.

```sql
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    contact VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.22 Tabel `inventory_items`
Bahan baku/inventory per outlet.

```sql
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL, -- gram, ml, piece
    reorder_point DECIMAL(12,3) DEFAULT 0,
    current_stock DECIMAL(12,3) DEFAULT 0,
    unit_cost DECIMAL(12,2) DEFAULT 0,
    supplier_id UUID REFERENCES suppliers(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.23 Tabel `inventory_logs`
Log perubahan stok.

```sql
CREATE TYPE inventory_log_type AS ENUM ('in','out','adjustment','waste');

CREATE TABLE inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    type inventory_log_type NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    reference_type VARCHAR(50), -- order, purchase, adjustment
    reference_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.24 Tabel `product_bom`
Bill of Materials - resep bahan per produk.

```sql
CREATE TABLE product_bom (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity_used DECIMAL(12,3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.25 Tabel `daily_sales`
Agregat penjualan harian.

```sql
CREATE TABLE daily_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    date DATE NOT NULL,
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(14,2) DEFAULT 0,
    total_tax DECIMAL(14,2) DEFAULT 0,
    total_discount DECIMAL(14,2) DEFAULT 0,
    total_profit DECIMAL(14,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, date)
);
```

### 2.26 Tabel `monthly_reports`
Agregat laporan bulanan.

```sql
CREATE TABLE monthly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    total_revenue DECIMAL(14,2) DEFAULT 0,
    total_cogs DECIMAL(14,2) DEFAULT 0,
    gross_profit DECIMAL(14,2) DEFAULT 0,
    operating_expenses JSONB DEFAULT '{}',
    net_profit DECIMAL(14,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, month, year)
);
```

---

## 3. Indeks Rekomendasi

```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_outlet ON products(outlet_id);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_options_product ON product_options(product_id);
CREATE INDEX idx_option_values_option ON option_values(option_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_outlet ON orders(outlet_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_transaction ON payments(transaction_id);
CREATE INDEX idx_inventory_logs_item ON inventory_logs(inventory_item_id);
CREATE INDEX idx_daily_sales_outlet_date ON daily_sales(outlet_id, date);
CREATE INDEX idx_monthly_reports_outlet ON monthly_reports(outlet_id, year, month);
```

---

## 4. Trigger & Fungsi Penting

### 4.1 Auto-update updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 Agregasi Daily Sales (Cron / Trigger)

```sql
CREATE OR REPLACE FUNCTION aggregate_daily_sales(p_date DATE, p_outlet_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO daily_sales (outlet_id, date, total_orders, total_revenue, total_tax, total_discount, total_profit)
    SELECT 
        outlet_id,
        p_date,
        COUNT(*),
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(total_amount - tax_amount - discount_amount), 0)
    FROM orders
    WHERE DATE(created_at) = p_date
      AND outlet_id = p_outlet_id
      AND status IN ('completed','paid')
    GROUP BY outlet_id
    ON CONFLICT (outlet_id, date) DO UPDATE SET
        total_orders = EXCLUDED.total_orders,
        total_revenue = EXCLUDED.total_revenue,
        total_tax = EXCLUDED.total_tax,
        total_discount = EXCLUDED.total_discount,
        total_profit = EXCLUDED.total_profit;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 Kurangi Stok saat Order Completed

```sql
CREATE OR REPLACE FUNCTION deduct_inventory_on_order_complete()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        INSERT INTO inventory_logs (inventory_item_id, type, quantity, reference_type, reference_id, note)
        SELECT 
            b.inventory_item_id,
            'out',
            b.quantity_used * oi.quantity,
            'order',
            NEW.id,
            'Auto deduct from completed order'
        FROM order_items oi
        JOIN product_bom b ON b.product_id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        UPDATE inventory_items i
        SET current_stock = i.current_stock - sub.deduction,
            updated_at = NOW()
        FROM (
            SELECT b.inventory_item_id, SUM(b.quantity_used * oi.quantity) AS deduction
            FROM order_items oi
            JOIN product_bom b ON b.product_id = oi.product_id
            WHERE oi.order_id = NEW.id
            GROUP BY b.inventory_item_id
        ) sub
        WHERE i.id = sub.inventory_item_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_completed_deduct_inventory
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_order_complete();
```

---

## 5. Catatan Penting

- Semua data sensitif seperti password di-hash sebelum disimpan.
- Harga dan kustomisasi di-snapshot di `order_items` dan `order_item_options` agar historis tetap akurat meskipun harga produk berubah.
- `daily_sales` dan `monthly_reports` adalah tabel agregat untuk mempercepat dashboard.
- Stok bahan baku otomatis berkurang saat order status menjadi `completed`.
- Data audit disimpan di `order_status_logs` dan `inventory_logs`.

# Class Diagram - CoffeeShop Online

> Pemodelan Berorientasi Objek - Class Diagram

```mermaid
classDiagram
    class User {
        +UUID id
        +String email
        +String phone
        +String password_hash
        +String full_name
        +UserRole role
        +Boolean is_active
        +DateTime created_at
        +login()
        +logout()
        +updateProfile()
    }

    class Customer {
        +UUID id
        +UUID user_id
        +LoyaltyTier loyalty_tier
        +Integer total_points
        +Date birth_date
        +Json preferences
        +earnPoints(amount)
        +redeemPoints(amount)
        +getTier()
    }

    class Address {
        +UUID id
        +UUID customer_id
        +String label
        +String full_address
        +Decimal latitude
        +Decimal longitude
        +Boolean is_default
    }

    class Outlet {
        +UUID id
        +String name
        +String code
        +String address
        +String phone
        +String email
        +Json opening_hours
        +Boolean is_active
        +getOperatingStatus()
    }

    class Category {
        +UUID id
        +String name
        +String description
        +Integer sort_order
        +Boolean is_active
    }

    class Product {
        +UUID id
        +UUID outlet_id
        +UUID category_id
        +String name
        +String description
        +Decimal base_price
        +String image_url
        +Boolean is_available
        +Boolean is_active
        +calculatePrice(variants, options)
    }

    class ProductVariant {
        +UUID id
        +UUID product_id
        +String name
        +String sku
        +Decimal price_adjustment
        +Integer stock_quantity
        +Boolean is_active
    }

    class ProductOption {
        +UUID id
        +UUID product_id
        +String name
        +String option_type
        +Integer min_select
        +Integer max_select
        +Boolean is_required
    }

    class OptionValue {
        +UUID id
        +UUID option_id
        +String value
        +Decimal price_adjustment
        +String stock_code
    }

    class Cart {
        +UUID id
        +UUID customer_id
        +Json items
        +Decimal total
        +addItem(item)
        +removeItem(itemId)
        +updateQuantity(itemId, qty)
        +applyVoucher(code)
        +calculateTotal()
    }

    class CartItem {
        +UUID id
        +UUID cart_id
        +UUID product_id
        +UUID variant_id
        +Json selected_options
        +Integer quantity
        +Decimal unit_price
        +Decimal subtotal
    }

    class Order {
        +UUID id
        +UUID customer_id
        +UUID outlet_id
        +String order_number
        +FulfillmentType fulfillment_type
        +OrderStatus status
        +Decimal total_amount
        +Decimal tax_amount
        +Decimal discount_amount
        +Integer points_used
        +Decimal delivery_fee
        +DateTime pickup_time
        +String table_number
        +String note
        +DateTime created_at
        +placeOrder()
        +cancelOrder(reason)
        +updateStatus(newStatus)
        +calculateTotal()
    }

    class OrderItem {
        +UUID id
        +UUID order_id
        +UUID product_id
        +UUID variant_id
        +Integer quantity
        +Decimal unit_price
        +Decimal subtotal
        +Json customizations
    }

    class OrderItemOption {
        +UUID id
        +UUID order_item_id
        +UUID option_value_id
        +Integer quantity
        +Decimal price
    }

    class OrderStatusLog {
        +UUID id
        +UUID order_id
        +OrderStatus status
        +String note
        +UUID created_by
        +DateTime created_at
    }

    class Payment {
        +UUID id
        +UUID order_id
        +Decimal amount
        +PaymentMethod payment_method
        +String transaction_id
        +PaymentStatus status
        +DateTime paid_at
        +processPayment()
        +verifyPayment()
        +refundPayment()
    }

    class Voucher {
        +UUID id
        +String code
        +String description
        +DiscountType discount_type
        +Decimal discount_value
        +Decimal min_purchase
        +Decimal max_discount
        +Integer usage_limit
        +Integer used_count
        +DateTime start_date
        +DateTime end_date
        +Boolean is_active
        +validate(orderTotal)
        +apply(orderTotal)
    }

    class LoyaltyTier {
        +UUID id
        +String name
        +Integer min_points
        +Decimal discount_pct
        +Json benefits
    }

    class LoyaltyPoint {
        +UUID id
        +UUID customer_id
        +UUID order_id
        +Integer points_earned
        +Integer points_redeemed
        +Integer balance
        +Date expiry_date
        +DateTime created_at
    }

    class Review {
        +UUID id
        +UUID order_id
        +UUID customer_id
        +Integer rating
        +String comment
        +DateTime created_at
    }

    class InventoryItem {
        +UUID id
        +UUID outlet_id
        +String name
        +String unit
        +Decimal reorder_point
        +Decimal current_stock
        +Decimal unit_cost
        +UUID supplier_id
        +checkStock()
        +deductStock(qty)
        +addStock(qty)
    }

    class InventoryLog {
        +UUID id
        +UUID inventory_item_id
        +String type
        +Decimal quantity
        +String reference_type
        +UUID reference_id
        +String note
        +DateTime created_at
    }

    class Supplier {
        +UUID id
        +String name
        +String contact
        +String email
        +String phone
        +String address
        +Boolean is_active
    }

    class ProductBOM {
        +UUID id
        +UUID product_id
        +UUID inventory_item_id
        +Decimal quantity_used
    }

    class DailySales {
        +UUID id
        +UUID outlet_id
        +Date date
        +Integer total_orders
        +Decimal total_revenue
        +Decimal total_tax
        +Decimal total_discount
        +Decimal total_profit
    }

    class MonthlyReport {
        +UUID id
        +UUID outlet_id
        +Integer month
        +Integer year
        +Decimal total_revenue
        +Decimal total_cogs
        +Decimal gross_profit
        +Decimal net_profit
        +Json expenses
    }

    User "1" -- "0..1" Customer : has
    Customer "1" -- "0..*" Address : has
    Customer "1" -- "0..*" Order : places
    Customer "1" -- "0..*" Review : writes
    Customer "1" -- "0..*" LoyaltyPoint : accumulates
    Customer "0..1" -- "0..*" Cart : owns
    
    Outlet "1" -- "0..*" Product : offers
    Outlet "1" -- "0..*" InventoryItem : stocks
    Outlet "1" -- "0..*" Order : receives
    Outlet "1" -- "0..*" DailySales : generates
    Outlet "1" -- "0..*" MonthlyReport : generates
    
    Category "1" -- "0..*" Product : categorizes
    
    Product "1" -- "0..*" ProductVariant : has
    Product "1" -- "0..*" ProductOption : has
    Product "1" -- "0..*" ProductBOM : consumes
    
    ProductOption "1" -- "0..*" OptionValue : contains
    
    Cart "1" -- "0..*" CartItem : contains
    CartItem "1" -- "0..*" Product : references
    CartItem "1" -- "0..1" ProductVariant : references
    
    Order "1" -- "0..*" OrderItem : contains
    Order "1" -- "0..1" Payment : has
    Order "1" -- "0..*" OrderStatusLog : tracks
    Order "0..1" -- "0..1" Voucher : uses
    
    OrderItem "1" -- "0..*" OrderItemOption : includes
    OrderItem "1" -- "0..1" ProductVariant : references
    OrderItemOption "1" -- "1" OptionValue : references
    
    InventoryItem "1" -- "0..*" InventoryLog : logs
    InventoryItem "0..1" -- "0..*" ProductBOM : used in
    Supplier "1" -- "0..*" InventoryItem : supplies
    
    LoyaltyTier "1" -- "0..*" Customer : tier assignment
```

## Penjelasan Relasi Kunci

| Relasi | Makna |
|--------|-------|
| User - Customer | Satu user bisa menjadi satu customer (1:1 opsional). |
| Customer - Order | Satu customer bisa memiliki banyak order. |
| Outlet - Product | Setiap outlet punya katalog produk sendiri (multi-outlet). |
| Product - ProductVariant - OptionValue | Produk memiliki varian (ukuran) dan opsi (susu, gula, topping). |
| Order - OrderItem - OrderItemOption | Struktur hierarkis pesanan. |
| ProductBOM - InventoryItem | Menghubungkan produk dengan bahan baku untuk auto-deduction stok. |
| Order - Payment - OrderStatusLog | Setiap order punya satu pembayaran dan banyak log status. |
| Customer - LoyaltyPoint - LoyaltyTier | Pelacakan poin dan tier loyalitas. |
| Outlet - DailySales/MonthlyReport | Agregat laporan per outlet. |

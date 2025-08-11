# 📘 คู่มือการย้ายจาก Supabase ไปใช้ PostgreSQL

## 🎯 ภาพรวม
คู่มือนี้จะช่วยคุณย้ายระบบจัดการสต็อกสินค้าจาก Supabase มาใช้ PostgreSQL บน Ubuntu Server

## 📋 สิ่งที่ต้องเตรียม
- Ubuntu Server (18.04+)
- Node.js (16+)
- สิทธิ์ sudo บน server
- ความรู้พื้นฐานเกี่ยวกับ Linux และ PostgreSQL

## 🚀 ขั้นตอนการติดตั้ง

### 1. ติดตั้ง PostgreSQL บน Ubuntu Server

```bash
# รันสคริปต์ติดตั้ง PostgreSQL
sudo ./setup-postgresql-ubuntu.sh
```

**หรือติดตั้งด้วยตนเอง:**

```bash
# อัพเดต package list
sudo apt update

# ติดตั้ง PostgreSQL
sudo apt install -y postgresql postgresql-contrib postgresql-client

# เริ่มต้น service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# ตั้งค่า password สำหรับ postgres user
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your_secure_password';"

# สร้าง database และ user
sudo -u postgres createdb stock_management
sudo -u postgres psql -c "CREATE USER stock_app_user WITH PASSWORD 'app_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stock_management TO stock_app_user;"
```

### 2. ตั้งค่าการเชื่อมต่อจากภายนอก (ถ้าจำเป็น)

```bash
# แก้ไข postgresql.conf
sudo nano /etc/postgresql/*/main/postgresql.conf
# เปลี่ยน #listen_addresses = 'localhost' เป็น listen_addresses = '*'

# แก้ไข pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf
# เพิ่มบรรทัด: host all all 0.0.0.0/0 md5

# รีสตาร์ท PostgreSQL
sudo systemctl restart postgresql

# เปิด firewall (ถ้าใช้ ufw)
sudo ufw allow 5432/tcp
```

### 3. สร้าง Schema และตาราง

```bash
# รันสคริปต์สร้าง schema
./setup-database-schema.sh
```

### 4. ติดตั้ง PostgreSQL Client Libraries

```bash
# ติดตั้ง dependencies
npm install pg @types/pg dotenv
```

### 5. ตั้งค่า Environment Variables

```bash
# สร้างไฟล์ .env จาก template
cp env.example .env

# แก้ไขค่าในไฟล์ .env
nano .env
```

**ตัวอย่างไฟล์ .env:**
```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stock_management
DB_USER=stock_app_user
DB_PASSWORD=app_secure_password

# EmailJS Configuration (ไม่เปลี่ยน)
VITE_EMAILJS_PUBLIC_KEY=your_public_key
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_TEMPLATE_ID=your_template_id
```

### 6. ทดสอบการเชื่อมต่อ

```bash
# ทดสอบการเชื่อมต่อฐานข้อมูล
node test-postgresql-connection.js
```

## 🔧 การเปลี่ยนแปลงในโค้ด

### การใช้งาน Database Service ใหม่

**เดิม (Supabase):**
```typescript
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase
  .from('products')
  .select('*');
```

**ใหม่ (PostgreSQL):**
```typescript
import { DatabaseService } from '@/lib/database';

const products = await DatabaseService.getProducts();
```

### ไฟล์ที่ต้องอัพเดต

1. **src/lib/database.ts** - ไฟล์การเชื่อมต่อฐานข้อมูลใหม่
2. **src/contexts/StockContext.tsx** - อัพเดตให้ใช้ DatabaseService
3. **components ต่างๆ** - เปลี่ยนจาก supabase มาใช้ DatabaseService

## 📊 การย้ายข้อมูล

### 1. Export ข้อมูลจาก Supabase

```sql
-- ใน Supabase SQL Editor
COPY categories TO STDOUT WITH CSV HEADER;
COPY suppliers TO STDOUT WITH CSV HEADER;
COPY products TO STDOUT WITH CSV HEADER;
COPY movements TO STDOUT WITH CSV HEADER;
```

### 2. Import ข้อมูลเข้า PostgreSQL

```bash
# Import categories
psql -h localhost -U stock_app_user -d stock_management -c "\COPY categories FROM 'categories.csv' WITH CSV HEADER;"

# Import suppliers
psql -h localhost -U stock_app_user -d stock_management -c "\COPY suppliers FROM 'suppliers.csv' WITH CSV HEADER;"

# Import products
psql -h localhost -U stock_app_user -d stock_management -c "\COPY products FROM 'products.csv' WITH CSV HEADER;"

# Import movements
psql -h localhost -U stock_app_user -d stock_management -c "\COPY movements FROM 'movements.csv' WITH CSV HEADER;"
```

## 🔒 ความปลอดภัย

### 1. การตั้งค่า Password
```bash
# เปลี่ยน password ของ postgres user
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'new_strong_password';"

# เปลี่ยน password ของ app user
sudo -u postgres psql -c "ALTER USER stock_app_user PASSWORD 'new_app_password';"
```

### 2. การตั้งค่า Firewall
```bash
# อนุญาตเฉพาะ IP ที่ต้องการ
sudo ufw allow from 192.168.1.0/24 to any port 5432

# หรือปิดการเข้าถึงจากภายนอก (ถ้าใช้ localhost เท่านั้น)
sudo ufw deny 5432
```

### 3. การ Backup
```bash
# สร้าง backup script
cat > backup-database.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U stock_app_user stock_management > backup_$DATE.sql
echo "Backup created: backup_$DATE.sql"
EOF

chmod +x backup-database.sh
```

## 🔧 การ Monitoring

### 1. ตรวจสอบสถานะ PostgreSQL
```bash
# ตรวจสอบ service
sudo systemctl status postgresql

# ตรวจสอบ connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE datname = 'stock_management';"

# ตรวจสอบ disk space
df -h /var/lib/postgresql/
```

### 2. Log Files
```bash
# ดู PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*-main.log
```

## 🚨 การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

1. **Connection refused**
   ```bash
   # ตรวจสอบว่า PostgreSQL ทำงานอยู่
   sudo systemctl status postgresql
   
   # รีสตาร์ท service
   sudo systemctl restart postgresql
   ```

2. **Authentication failed**
   ```bash
   # ตรวจสอบ pg_hba.conf
   sudo nano /etc/postgresql/*/main/pg_hba.conf
   
   # ตรวจสอบ password
   sudo -u postgres psql -c "\du"
   ```

3. **Permission denied**
   ```bash
   # เช็คสิทธิ์ของ user
   sudo -u postgres psql -d stock_management -c "\dp"
   
   # ให้สิทธิ์เพิ่มเติม
   sudo -u postgres psql -c "GRANT ALL ON SCHEMA public TO stock_app_user;"
   ```

## 📈 Performance Tuning

### 1. การตั้งค่า PostgreSQL
```bash
# แก้ไข postgresql.conf
sudo nano /etc/postgresql/*/main/postgresql.conf

# เพิ่มการตั้งค่าเหล่านี้:
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
```

### 2. Index Optimization
```sql
-- สร้าง index สำหรับการค้นหาที่ใช้บ่อย
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_movements_product ON movements(product_id);
CREATE INDEX idx_movements_created_at ON movements(created_at);
```

## 🎯 ขั้นตอนสุดท้าย

1. ✅ ทดสอบการเชื่อมต่อฐานข้อมูล
2. ✅ ย้ายข้อมูลจาก Supabase
3. ✅ อัพเดตโค้ดแอปพลิเคชัน
4. ✅ ทดสอบการทำงานของระบบ
5. ✅ ตั้งค่า backup และ monitoring
6. ✅ ปิดการใช้งาน Supabase (ถ้าไม่ต้องการแล้ว)

## 📞 การสนับสนุน

หากมีปัญหาในการติดตั้งหรือการใช้งาน สามารถ:
- ตรวจสอบ log files
- รันสคริปต์ทดสอบการเชื่อมต่อ
- ดูเอกสาร PostgreSQL official documentation
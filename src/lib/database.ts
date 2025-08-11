import { Pool } from 'pg';

// กำหนดค่าการเชื่อมต่อฐานข้อมูล PostgreSQL
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_management',
  user: process.env.DB_USER || 'stock_app_user',
  password: process.env.DB_PASSWORD || 'app_secure_password',
  max: 20, // จำนวน connection สูงสุดใน pool
  idleTimeoutMillis: 30000, // timeout สำหรับ idle connection
  connectionTimeoutMillis: 2000, // timeout สำหรับการเชื่อมต่อ
};

// สร้าง connection pool
export const pool = new Pool(dbConfig);

// ฟังก์ชันทดสอบการเชื่อมต่อ
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ เชื่อมต่อฐานข้อมูล PostgreSQL สำเร็จ:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ การเชื่อมต่อฐานข้อมูล PostgreSQL ล้มเหลว:', error);
    return false;
  }
};

// ฟังก์ชันปิดการเชื่อมต่อ
export const closeConnection = async (): Promise<void> => {
  await pool.end();
  console.log('🔌 ปิดการเชื่อมต่อฐานข้อมูล PostgreSQL');
};

// Database query functions
export class DatabaseService {
  // Products
  static async getProducts() {
    const query = `
      SELECT p.*, c.name as category_name, s.name as supplier_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN suppliers s ON p.supplier_id = s.id 
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async createProduct(product: any) {
    const query = `
      INSERT INTO products (name, sku, description, category_id, supplier_id, unit_price, current_stock, min_stock, max_stock, unit, location, barcode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const values = [
      product.name, product.sku, product.description, product.category_id,
      product.supplier_id, product.unit_price, product.current_stock,
      product.min_stock, product.max_stock, product.unit, product.location, product.barcode
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async updateProduct(id: string, product: any) {
    const query = `
      UPDATE products 
      SET name = $2, sku = $3, description = $4, category_id = $5, supplier_id = $6,
          unit_price = $7, current_stock = $8, min_stock = $9, max_stock = $10,
          unit = $11, location = $12, barcode = $13, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const values = [
      id, product.name, product.sku, product.description, product.category_id,
      product.supplier_id, product.unit_price, product.current_stock,
      product.min_stock, product.max_stock, product.unit, product.location, product.barcode
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deleteProduct(id: string) {
    const query = 'DELETE FROM products WHERE id = $1';
    await pool.query(query, [id]);
  }

  // Categories
  static async getCategories() {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    return result.rows;
  }

  static async createCategory(category: any) {
    const query = 'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *';
    const result = await pool.query(query, [category.name, category.description]);
    return result.rows[0];
  }

  // Suppliers
  static async getSuppliers() {
    const result = await pool.query('SELECT * FROM suppliers ORDER BY name');
    return result.rows;
  }

  static async createSupplier(supplier: any) {
    const query = `
      INSERT INTO suppliers (name, email, phone, address, contact_person)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [supplier.name, supplier.email, supplier.phone, supplier.address, supplier.contact_person];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Movements
  static async getMovements() {
    const query = `
      SELECT m.*, p.name as product_name, p.sku
      FROM movements m
      LEFT JOIN products p ON m.product_id = p.id
      ORDER BY m.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async createMovement(movement: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // เพิ่ม movement record
      const movementQuery = `
        INSERT INTO movements (product_id, type, quantity, reason, reference, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const movementValues = [
        movement.product_id, movement.type, movement.quantity,
        movement.reason, movement.reference, movement.notes
      ];
      const movementResult = await client.query(movementQuery, movementValues);

      // อัพเดต stock ในตาราง products
      const stockChange = movement.type === 'in' ? movement.quantity : -movement.quantity;
      const updateStockQuery = `
        UPDATE products 
        SET current_stock = current_stock + $1, updated_at = NOW()
        WHERE id = $2
      `;
      await client.query(updateStockQuery, [stockChange, movement.product_id]);

      await client.query('COMMIT');
      return movementResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Statistics
  static async getStats() {
    const queries = await Promise.all([
      pool.query('SELECT COUNT(*) as total_products FROM products'),
      pool.query('SELECT SUM(current_stock * unit_price) as total_value FROM products'),
      pool.query('SELECT COUNT(*) as low_stock FROM products WHERE current_stock <= min_stock AND current_stock > 0'),
      pool.query('SELECT COUNT(*) as out_of_stock FROM products WHERE current_stock = 0'),
      pool.query('SELECT COUNT(*) as recent_movements FROM movements WHERE created_at >= NOW() - INTERVAL \'7 days\'')
    ]);

    return {
      totalProducts: parseInt(queries[0].rows[0].total_products) || 0,
      totalValue: parseFloat(queries[1].rows[0].total_value) || 0,
      lowStockItems: parseInt(queries[2].rows[0].low_stock) || 0,
      outOfStockItems: parseInt(queries[3].rows[0].out_of_stock) || 0,
      recentMovements: parseInt(queries[4].rows[0].recent_movements) || 0,
    };
  }
}

// ตรวจสอบการเชื่อมต่อเมื่อโหลด module
testConnection();
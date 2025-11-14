process.env.TZ = 'Asia/Ho_Chi_Minh';

const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public')); // Phục vụ file tĩnh nếu cần (images)
app.use(express.json()); // Parse JSON body

const dbConfig = {
  user: 'sa', // username SQL Server
  password: '123456', // password
  server: 'localhost', // Hoặc IP
  database: 'myweb',
  options: { encrypt: false, trustServerCertificate: true }
};

let pool;
async function connectDB() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('Connected to DB');
  } catch (err) {
    console.error('DB Connection Failed', err);
  }
}
connectDB();
// Hàm kết nối lại nếu pool bị hỏng
async function getPool() {
  if (!pool || !pool.connected) {
    pool = await sql.connect(dbConfig);
    console.log('Reconnected to DB');
  }
  return pool;
}

// Middleware để đảm bảo kết nối trước mỗi yêu cầu
app.use(async (req, res, next) => {
  try {
    req.pool = await getPool();
    next();
  } catch (err) {
    console.error('DB Connection Failed', err);
    res.status(500).json({ message: 'Lỗi kết nối cơ sở dữ liệu' });
  }
});

// Hàm kiểm tra đăng nhập chung
async function checkLogin(username, password) {
  const result = await pool.request()
    .input('username', sql.NVarChar, username)
    .query('SELECT * FROM Users WHERE username = @username');
  const user = result.recordset[0];
  if (!user) return { error: 'Tên đăng nhập không tồn tại' };

  let passwordMatch;
  if (user.password.startsWith('$2b$')) {
    passwordMatch = await bcrypt.compare(password, user.password);
  } else {
    passwordMatch = user.password === password;
  }
  if (!passwordMatch) return { error: 'Mật khẩu không đúng' };

  return { user };
}

// Endpoint đăng nhập admin
app.post('/api/auth/admin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { user, error } = await checkLogin(username, password);
    if (error) return res.status(401).json({ message: error });

    if (user.role !== 1) {
      return res.status(403).json({ message: 'Bạn không có quyền đăng nhập admin' });
    }

    res.json({ message: 'Đăng nhập admin thành công', username: user.username });
  } catch (err) {
    console.error('Login admin error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Endpoint đăng nhập user thường
app.post('/api/auth/user-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { user, error } = await checkLogin(username, password);
    if (error) return res.status(401).json({ message: error });

    if (user.role === 1) {
      return res.status(403).json({ message: 'Bạn không có quyền đăng nhập user' });
    }

    res.json({
      message: 'Đăng nhập user thành công',
      username: user.username,
      user_id: user.user_id,  // Thêm dòng này
      token: 'your-jwt-token',  // Hoặc tạo token thật nếu dùng JWT
      redirectUrl: '/index.html'
    });

  } catch (err) {
    console.error('Login user error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Endpoint đăng ký user
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email, phone, name, role } = req.body;
  try {
    const pool = await sql.connect(dbConfig);
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('password', sql.NVarChar, hashedPassword)
      .input('email', sql.NVarChar, email)
      .input('phone', sql.NVarChar, phone)
      .input('name', sql.NVarChar, name)
      .input('role', sql.Int, role)
      .query('INSERT INTO Users (username, password, email, phone, name, role) OUTPUT INSERTED.user_id VALUES (@username, @password, @email, @phone, @name, @role)');

    const userId = result.recordset[0].user_id;
    res.status(201).json({ message: 'Đăng ký thành công', user_id: userId });
  } catch (err) {
    console.error('Lỗi đăng ký:', err);
    res.status(500).json({ message: 'Lỗi khi đăng ký', error: err.message });
  }
});

// USERS CRUD
app.get('/api/users', async (req, res) => {
  try {
    const result = await req.pool.request().query('SELECT user_id, username, email, role FROM Users');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng', error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, email, role } = req.body; // Loại bỏ province, district, address khỏi đây
  try {
    // Kiểm tra username và email đã tồn tại
    const checkUsername = await req.pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT 1 FROM Users WHERE username = @username');
    if (checkUsername.recordset.length > 0) {
      return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
    } else {
      const checkEmail = await req.pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT 1 FROM Users WHERE email = @email');
      if (checkEmail.recordset.length > 0) {
        return res.status(400).json({ message: 'Eemail đã tồn tại' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await req.pool.request()
      .input('username', sql.NVarChar, username)
      .input('password', sql.VarChar, hashedPassword)
      .input('email', sql.NVarChar, email)
      .input('role', sql.Int, role !== undefined ? role : 0)
      .query('INSERT INTO Users (username, password, email, role) OUTPUT INSERTED.user_id VALUES (@username, @password, @email, @role)');
    const userId = result.recordset[0].user_id;

    res.status(201).json({ id: userId }); // Chỉ trả về user_id
  } catch (err) {
    console.error('Insert user error:', err);
    res.status(500).json({ message: 'Lỗi khi tạo người dùng', error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { username, password, email, role } = req.body;
  try {
    const request = req.pool.request()
      .input('id', sql.Int, req.params.id)
      .input('username', sql.NVarChar, username)
      .input('email', sql.NVarChar, email)
      .input('role', sql.Int, role);
    let query = 'UPDATE Users SET username = @username, email = @email, role = @role WHERE user_id = @id';
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = @password';
      request.input('password', sql.VarChar, hashedPassword);
    }
    await request.query(query);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi cập nhật người dùng', error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await req.pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Users WHERE user_id = @id');
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi xóa người dùng', error: err.message });
  }
});

// Lấy thông tin user + địa chỉ mặc định
app.get('/api/users/:id/info', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Thiếu userId' });

    const result = await req.pool.request()
      .input('user_id', sql.Int, id)
      .query(`
        SELECT U.user_id, U.username, U.email, 
               A.address_id, A.address_line, A.city, A.district, A.phone
        FROM Users U
        LEFT JOIN Addresses A ON U.user_id = A.user_id
        WHERE U.user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User không tồn tại' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Get user info error:', err);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin người dùng' });
  }
});



// USER ADDRESSES CRUD
app.post('/api/addresses', async (req, res) => {
  const { user_id, city, district, address_line, phone } = req.body; // Sử dụng city, address_line thay vì province, address
  try {
    if (!user_id || !city || !district || !address_line || !phone) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (user_id, city, district, address_line, phone)' });
    }
    await req.pool.request()
      .input('user_id', sql.Int, user_id)
      .input('city', sql.NVarChar, city)
      .input('district', sql.NVarChar, district)
      .input('address_line', sql.NVarChar, address_line)
      .input('phone', sql.NVarChar, phone)
      .query('INSERT INTO Addresses (user_id, city, district, address_line, phone) VALUES (@user_id, @city, @district, @address_line, @phone)');
    res.sendStatus(201);
  } catch (err) {
    console.error('Lỗi khi lưu địa chỉ:', err);
    res.status(500).json({ message: 'Lỗi khi lưu địa chỉ', error: err.message });
  }
});

app.get('/api/addresses/:user_id', async (req, res) => {
  try {
    const result = await req.pool.request()
      .input('user_id', sql.Int, req.params.user_id)
      .query('SELECT address_id, user_id, city, district, address_line, phone FROM Addresses WHERE user_id = @user_id');
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy địa chỉ cho người dùng này' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy địa chỉ', error: err.message });
  }
});

// PRODUCTS CRUD
app.get('/api/products', async (req, res) => {
  const { collection, category, sort } = req.query;
  let query = 'SELECT * FROM Products WHERE 1=1';
  const params = {};

  if (collection) {
    query += ' AND collection_id = @collection';
    params.collection = parseInt(collection);
  }
  if (category) {
    query += ' AND product_name LIKE @category';
    params.category = `%${category}%`;
  }
  if (sort) {
    if (sort === 'new') query += ' ORDER BY created_at DESC';
    if (sort === 'hot') query += ' ORDER BY sold_count DESC';
    if (sort === 'sale') query += ' ORDER BY price_promotion ASC';
  }

  try {
    const result = await pool.request()
      .input('collection', sql.Int, params.collection)
      .input('category', sql.NVarChar, params.category)
      .query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu sản phẩm:', error);
    res.status(500).send('Lỗi khi lấy dữ liệu sản phẩm');
  }
});

app.post('/api/products', async (req, res) => {
  const { product_name, price, image_url, price_promotion, detail, collection_id, status } = req.body;
  await pool.request()
    .input('product_name', sql.NVarChar, product_name)
    .input('price', sql.Decimal(18, 2), price)
    .input('image_url', sql.NVarChar, image_url)
    .input('price_promotion', sql.Decimal(18, 2), price_promotion)
    .input('detail', sql.NVarChar(sql.MAX), detail)
    .input('collection_id', sql.Int, collection_id)
    .input('status', sql.Int, status)
    .query('INSERT INTO Products (product_name, price, image_url, price_promotion, detail, collection_id, status) VALUES (@product_name, @price, @image_url, @price_promotion, @detail, @collection_id, @status)');
  res.sendStatus(201);
});

app.put('/api/products/:id', async (req, res) => {
  const { product_name, price, image_url, price_promotion, detail, collection_id, status } = req.body;
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('product_name', sql.NVarChar, product_name)
    .input('price', sql.Decimal(18, 2), price)
    .input('image_url', sql.NVarChar, image_url)
    .input('price_promotion', sql.Decimal(18, 2), price_promotion)
    .input('detail', sql.NVarChar(sql.MAX), detail)
    .input('collection_id', sql.Int, collection_id)
    .input('status', sql.Int, status)
    .query('UPDATE Products SET product_name = @product_name, price = @price, image_url = @image_url, price_promotion = @price_promotion, detail = @detail, collection_id = @collection_id, status = @status WHERE product_id = @id');
  res.sendStatus(200);
});

app.delete('/api/products/:id', async (req, res) => {
  await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Products WHERE product_id = @id');
  res.sendStatus(200);
});

// COLLECTIONS CRUD
app.get('/api/collections', async (req, res) => {
  const result = await pool.request().query('SELECT * FROM Collections');
  res.json(result.recordset);
});

app.get('/api/collections/:id', async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Collections WHERE collection_id = @id');
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
    }
    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin bộ sưu tập:', error);
    res.status(500).send('Lỗi khi lấy thông tin bộ sưu tập');
  }
});

app.post('/api/collections', async (req, res) => {
  const { collection_name, year_launch, image_url } = req.body;
  await pool.request()
    .input('collection_name', sql.NVarChar, collection_name)
    .input('year_launch', sql.NVarChar, year_launch)
    .input('image_url', sql.NVarChar, image_url)
    .query('INSERT INTO Collections (collection_name, year_launch, image_url) VALUES (@collection_name, @year_launch, @image_url)');
  res.sendStatus(201);
});

app.put('/api/collections/:id', async (req, res) => {
  const { collection_name, year_launch, image_url } = req.body;
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('collection_name', sql.NVarChar, collection_name)
    .input('year_launch', sql.NVarChar, year_launch)
    .input('image_url', sql.NVarChar, image_url)
    .query('UPDATE Collections SET collection_name = @collection_name, year_launch = @year_launch, image_url = @image_url WHERE collection_id = @id');
  res.sendStatus(200);
});

app.delete('/api/collections/:id', async (req, res) => {
  await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Collections WHERE collection_id = @id');
  res.sendStatus(200);
});

// ORDERS CRUD
app.get('/api/orders', async (req, res) => {
  const result = await pool.request().query('SELECT * FROM Orders');
  res.json(result.recordset);
});

// Trong server.js, thêm sau các endpoint hiện có
app.post('/api/orders', async (req, res) => {
  const orderData = req.body;
  try {
    let orderDate = orderData.order_date ? new Date(orderData.order_date) : new Date();
    // Chuẩn hóa múi giờ UTC+7
    const offset = 7 * 60; // 7 giờ = 420 phút
    orderDate.setMinutes(orderDate.getMinutes() + offset + orderDate.getTimezoneOffset());

    const result = await pool.request()
      .input('user_id', sql.Int, orderData.user_id || 1)
      .input('total_amount', sql.Decimal(18, 2), orderData.total || 0)
      .input('status', sql.Int, orderData.status || 1)
      .input('order_date', sql.DateTime, orderDate)
      .query('INSERT INTO Orders (user_id, total_amount, status, order_date) OUTPUT INSERTED.order_id VALUES (@user_id, @total_amount, @status, @order_date)');

    const orderId = result.recordset[0].order_id;

    if (orderData.items && orderData.items.length > 0) {
      const orderDetailsPromises = orderData.items.map(item =>
        pool.request()
          .input('order_id', sql.Int, orderId)
          .input('product_id', sql.Int, item.product_id || 1)
          .input('quantity', sql.Int, item.quantity || 1)
          .input('unit_price', sql.Decimal(18, 2), item.price_promotion || 0)
          .input('pay_method', sql.Int, item.pay_method || 0)
          .query('INSERT INTO OrderDetails (order_id, product_id, quantity, unit_price, pay_method) VALUES (@order_id, @product_id, @quantity, @unit_price, @pay_method)')
      );
      await Promise.all(orderDetailsPromises);
    }

    res.status(201).json({ message: "Đơn hàng đã được lưu thành công", order_id: orderId });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ message: 'Lỗi khi lưu đơn hàng', error: err.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { user_id, total_amount, status } = req.body;
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('user_id', sql.Int, user_id)
    .input('total_amount', sql.Decimal(18, 2), total_amount)
    .input('status', sql.Int, status)
    .query('UPDATE Orders SET user_id = @user_id, total_amount = @total_amount, status = @status WHERE order_id = @id');
  res.sendStatus(200);
});

app.delete('/api/orders/:id', async (req, res) => {
  await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Orders WHERE order_id = @id');
  res.sendStatus(200);
});

// ORDER DETAILS CRUD
app.get('/api/orderdetails/:order_id', async (req, res) => {
  const result = await pool.request()
    .input('order_id', sql.Int, req.params.order_id)
    .query('SELECT * FROM OrderDetails WHERE order_id = @order_id');
  res.json(result.recordset);
});

app.post('/api/orderdetails', async (req, res) => {
  const { order_id, product_id, quantity, unit_price, pay_method } = req.body;
  await pool.request()
    .input('order_id', sql.Int, order_id)
    .input('product_id', sql.Int, product_id)
    .input('quantity', sql.Int, quantity)
    .input('unit_price', sql.Decimal(18, 2), unit_price)
    .input('pay_method', sql.Int, pay_method)
    .query('INSERT INTO OrderDetails (order_id, product_id, quantity, unit_price, pay_method) VALUES (@order_id, @product_id, @quantity, @unit_price, @pay_method)');
  res.sendStatus(201);
});

app.put('/api/orderdetails/:id', async (req, res) => {
  const { order_id, product_id, quantity, unit_price, pay_method } = req.body;
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('order_id', sql.Int, order_id)
    .input('product_id', sql.Int, product_id)
    .input('quantity', sql.Int, quantity)
    .input('unit_price', sql.Decimal(18, 2), unit_price)
    .input('pay_method', sql.Int, pay_method)
    .query('UPDATE OrderDetails SET order_id = @order_id, product_id = @product_id, quantity = @quantity, unit_price = @unit_price, pay_method = @pay_method WHERE order_detail_id = @id');
  res.sendStatus(200);
});

app.delete('/api/orderdetails/:id', async (req, res) => {
  await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM OrderDetails WHERE order_detail_id = @id');
  res.sendStatus(200);
});

// STATS
app.get('/api/stats/revenue/day', async (req, res) => {
  const { pay_method } = req.query;
  let query = `
    SELECT CONVERT(VARCHAR(10), DATEADD(HOUR, 7, o.order_date), 120) AS date, SUM(od.quantity * od.unit_price) AS revenue
    FROM Orders o
    LEFT JOIN OrderDetails od ON o.order_id = od.order_id
  `;
  if (pay_method) {
    query += ` WHERE od.pay_method = @pay_method`;
  }
  query += ` GROUP BY CONVERT(VARCHAR(10), DATEADD(HOUR, 7, o.order_date), 120)`;
  try {
    const result = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(query);
    const data = result.recordset.reduce((acc, row) => ({ ...acc, [row.date]: row.revenue || 0 }), {});
    res.json(data);
  } catch (err) {
    console.error('Revenue day error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

app.get('/api/stats/revenue/month', async (req, res) => {
  const { pay_method } = req.query;
  let query = `
    SELECT CONVERT(VARCHAR(7), o.order_date, 120) AS month, SUM(od.quantity * od.unit_price) AS revenue
    FROM Orders o
    JOIN OrderDetails od ON o.order_id = od.order_id
  `;
  if (pay_method) {
    query += ` WHERE od.pay_method = @pay_method`;
  }
  query += ` GROUP BY CONVERT(VARCHAR(7), o.order_date, 120)`;
  try {
    const result = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(query);
    const data = result.recordset.reduce((acc, row) => ({ ...acc, [row.month]: row.revenue || 0 }), {});
    res.json(data);
  } catch (err) {
    console.error('Revenue month error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

app.get('/api/stats/ordercount/day', async (req, res) => {
  const { pay_method } = req.query;
  let query = `
    SELECT CONVERT(VARCHAR(10), DATEADD(HOUR, 7, o.order_date), 120) AS date, COUNT(DISTINCT o.order_id) AS order_count
    FROM Orders o
    LEFT JOIN OrderDetails od ON o.order_id = od.order_id
  `;
  if (pay_method) {
    query += ` WHERE od.pay_method = @pay_method`;
  }
  query += ` GROUP BY CONVERT(VARCHAR(10), DATEADD(HOUR, 7, o.order_date), 120)`;
  try {
    const result = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(query);
    const data = result.recordset.reduce((acc, row) => ({ ...acc, [row.date]: row.order_count || 0 }), {});
    res.json(data);
  } catch (err) {
    console.error('Order count day error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

app.get('/api/stats/total', async (req, res) => {
  const { pay_method } = req.query;
  try {
    let ordersQuery = 'SELECT COUNT(*) AS total_orders FROM Orders';
    let revenueQuery = 'SELECT SUM(od.quantity * od.unit_price) AS total_revenue FROM Orders o JOIN OrderDetails od ON o.order_id = od.order_id';
    if (pay_method) {
      ordersQuery += ` WHERE EXISTS (SELECT 1 FROM OrderDetails od WHERE od.order_id = Orders.order_id AND od.pay_method = @pay_method)`;
      revenueQuery += ` WHERE od.pay_method = @pay_method`;
    }
    const orders = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(ordersQuery);
    const revenue = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(revenueQuery);
    res.json({
      total_orders: orders.recordset[0].total_orders,
      total_revenue: revenue.recordset[0].total_revenue || 0
    });
  } catch (err) {
    console.error('Stats total error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

app.get('/api/stats/ordercount/day', async (req, res) => {
  const { pay_method } = req.query;
  let query = `
    SELECT CONVERT(VARCHAR(10), o.order_date, 120) AS date, COUNT(DISTINCT o.order_id) AS order_count
    FROM Orders o
    JOIN OrderDetails od ON o.order_id = od.order_id
  `;
  if (pay_method) {
    query += ` WHERE od.pay_method = @pay_method`;
  }
  query += ` GROUP BY CONVERT(VARCHAR(10), o.order_date, 120)`;
  try {
    const result = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(query);
    const data = result.recordset.reduce((acc, row) => ({ ...acc, [row.date]: row.order_count || 0 }), {});
    res.json(data);
  } catch (err) {
    console.error('Order count day error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

app.get('/api/stats/ordercount/month', async (req, res) => {
  const { pay_method } = req.query;
  let query = `
    SELECT CONVERT(VARCHAR(7), o.order_date, 120) AS month, COUNT(DISTINCT o.order_id) AS order_count
    FROM Orders o
    JOIN OrderDetails od ON o.order_id = od.order_id
  `;
  if (pay_method) {
    query += ` WHERE od.pay_method = @pay_method`;
  }
  query += ` GROUP BY CONVERT(VARCHAR(7), o.order_date, 120)`;
  try {
    const result = await pool.request()
      .input('pay_method', sql.Int, pay_method ? parseInt(pay_method) : null)
      .query(query);
    const data = result.recordset.reduce((acc, row) => ({ ...acc, [row.month]: row.order_count || 0 }), {});
    res.json(data);
  } catch (err) {
    console.error('Order count month error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
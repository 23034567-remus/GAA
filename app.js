const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'c369_ga'
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
}));

app.use(flash());

// Define the storage engine for multer
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'public/images'); // Set the destination for saving images
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Set the file name
    }
});

// Create the upload variable
const upload = multer({ storage: storage });

// Setting up EJS
app.set('view engine', 'ejs');

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/dashboard');
    }
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success') });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;

    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next(); 
}

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'), 
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            res.redirect('/dashboard');
        } else {
            req.flash('error', 'Invalid email or password');
            res.redirect('/login');
        }
    });
});

app.get('/dashboard', checkAuthenticated, (req, res) => {
    db.query('SELECT * FROM products', (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving products');
        }
        res.render('dashboard', { user: req.session.user, products: results });
    });
});

app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('SELECT * FROM products', (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving products');
        }
        res.render('admin', { user: req.session.user, products: results });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/product/:id', (req, res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';
    db.query(sql, [productId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving product');
        }
        if (results.length > 0) {
            res.render('product', { product: results[0] });
        } else {
            res.status(404).send('Product not found');
        }
    });
});

app.get('/addProduct', (req, res) => {
    res.render('addProduct');
});

app.post('/addProduct', upload.single('image'), (req, res) => {
    const { name, desc, price } = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; 
    } else {
        image = null;
    }

    const sql = 'INSERT INTO products (productName, image, productDesc, price) VALUES (?, ?, ?, ?)';
    db.query(sql, [name, image, desc, price], (error, results) => {
        if (error) {
            console.error("Error adding product:", error);
            res.status(500).send('Error adding product');
        } else {
            res.redirect('/dashboard');
        }
    });
});

app.get('/editProduct/:id', (req, res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';
    db.query(sql, [productId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving product');
        }
        if (results.length > 0) {
            res.render('editproduct', { product: results[0] });
        } else {
            res.status(404).send('Product not found');
        }
    });
});

app.post('/editProduct/:id', upload.single('image'), (req, res) => {
    const productId = req.params.id;
    const { name, desc, price } = req.body;
    let image = req.body.currentImage; 
    if (req.file) {  
        image = req.file.filename; 
    }

    const sql = 'UPDATE products SET productName = ?, image = ?, productDesc = ?, price = ? WHERE productId = ?';
    db.query(sql, [name, image, desc, price, productId], (error, results) => {
        if (error) {
            console.error("Error updating product:", error);
            res.status(500).send('Error updating product');
        } else {
            res.redirect('/dashboard');
        }
    });
});

app.get('/deleteProduct/:id', (req, res) => {
    const productId = req.params.id;
    const sql = 'DELETE FROM products WHERE productId = ?';
    db.query(sql, [productId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error deleting product');
        } else {
            res.redirect('/dashboard');
        }
    });
});

app.get('/account', checkAuthenticated, (req, res) => {
    res.render('account', { user: req.session.user });
});

app.post('/topup', checkAuthenticated, (req, res) => {
    const { amount, cardType, cardNumber, expiryDate, cvv } = req.body;
    const userId = req.session.user.id;

    if (!amount || isNaN(amount) || amount <= 0 || !cardType || !cardNumber || !expiryDate || !cvv) {
        req.flash('error', 'Please fill in all fields correctly.');
        return res.redirect('/account');
    }

    const sql = 'UPDATE users SET balance = balance + ? WHERE id = ?';
    db.query(sql, [parseFloat(amount), userId], (err, result) => {
        if (err) {
            console.error('Database query error:', err.message);
            req.flash('error', 'Error updating balance.');
            return res.redirect('/account');
        }

        req.session.user.balance += parseFloat(amount);
        
        // Log the transaction
        const logTransactionSql = 'INSERT INTO transactions (userId, amount) VALUES (?, ?)';
        db.query(logTransactionSql, [userId, parseFloat(amount)], (err, result) => {
            if (err) {
                console.error('Error logging transaction:', err.message);
            }
        });

        req.flash('success', 'Top up successful!');
        res.redirect('/account');
    });
});

app.get('/history', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const sql = 'SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC';
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).send('Error retrieving transaction history');
        }
        res.render('history', { transactions: results, user: req.session.user });
    });
});

app.get('/feedback', (req, res) => {
    res.render('feedback');
});

app.get('/rent/:id', checkAuthenticated, (req, res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';
    db.query(sql, [productId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving product');
        }
        if (results.length > 0) {
            res.render('rent', { user: req.session.user, product: results[0] });
        } else {
            res.status(404).send('Product not found');
        }
    });
});

app.post('/confirmRent/:id', checkAuthenticated, (req, res) => {
    const productId = req.params.id;
    const userId = req.session.user.id;

    // First, get the product price
    const productQuery = 'SELECT price FROM products WHERE productId = ?';
    db.query(productQuery, [productId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving product price');
        }

        if (results.length > 0) {
            const price = results[0].price;

            // Next, check if the user has enough balance
            const userQuery = 'SELECT balance FROM users WHERE id = ?';
            db.query(userQuery, [userId], (err, userResults) => {
                if (err) {
                    console.error('Database query error:', err.message);
                    return res.status(500).send('Error retrieving user balance');
                }

                if (userResults.length > 0) {
                    const balance = userResults[0].balance;

                    if (balance >= price) {
                        // Deduct the price from the user's balance
                        const updateBalanceQuery = 'UPDATE users SET balance = balance - ? WHERE id = ?';
                        db.query(updateBalanceQuery, [price, userId], (updateError, updateResults) => {
                            if (updateError) {
                                console.error('Database query error:', updateError.message);
                                return res.status(500).send('Error updating user balance');
                            }

                            // Insert transaction record
                            const insertTransactionQuery = 'INSERT INTO transactions (userId, amount, timestamp) VALUES (?, ?, NOW())';
                            db.query(insertTransactionQuery, [userId, price], (insertError, insertResults) => {
                                if (insertError) {
                                    console.error('Database query error:', insertError.message);
                                    return res.status(500).send('Error recording transaction');
                                }

                                req.session.user.balance -= price;
                                req.flash('success', 'Item rented successfully!');
                                res.redirect('/dashboard');
                            });
                        });
                    } else {
                        req.flash('error', 'Insufficient balance to rent this item');
                        res.redirect('/dashboard');
                    }
                } else {
                    res.status(404).send('User not found');
                }
            });
        } else {
            res.status(404).send('Product not found');
        }
    });
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
}); 
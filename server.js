const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('accounts.db');
const session = require("express-session");

const app = express();
const PORT = 3000;


db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);


app.set('view engine', 'ejs');
app.use(express.json());
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "cinemora_secret_key",
    resave: false,
    saveUninitialized: false
  })
);

app.get("/", (req, res) => {
  res.render("index", {
    user: req.session.user || null
  });
});

app.get('/login', (req, res) => {
  res.render('login', {error: null}); 
});

app.get('/signup', (req, res) => {
  res.render('signup', {error: null}); 
});

app.get('/signup-success', (req, res) => {
  res.render('signup-success'); 
});

app.get("/quen-mat-khau", (req, res) => {
    res.render("quen-mat-khau", { error: null });
});

app.get('/password-success', (req, res) => {
  res.render('password-success'); 
})

app.get("/search", (req, res) => {
    res.render("search", {
        user: req.session.user || null
    });
});

app.get("/search-result", (req, res) => {
    res.render("search-result", {
        user: req.session.user || null
    });
});

app.get("/trang-ds", (req, res) => {
    res.render("trang-ds", {
        user: req.session.user || null
    });
});

app.get("/trang-tt", (req, res) => {
    res.render("trang-tt", {
        user: req.session.user || null
    });
});

app.get("/trang-xem", (req, res) => {
    res.render("trang-xem", {
        user: req.session.user || null
    });
});

app.get("/vip", (req, res) => {
    res.render("vip", {
        user: req.session.user || null
    });
});

app.get("/thanh-toan", (req, res) => {
    res.render("thanh-toan", {
        user: req.session.user || null
    });
});

app.get("/vip-success", (req, res) => {
    res.render("vip-success", {
        user: req.session.user || null
    });
});

app.post("/login", (req, res) => {
    const { email, password } = req.body;

    const sql = `
        SELECT * FROM users
        WHERE email = ? AND password = ?
    `;

    db.get(sql, [email, password], (err, user) => {
        if (err) {
            return res.render("login", {
                error: "Lỗi hệ thống"
            });
        }

        if (!user) {
            return res.render("login", {
                error: "Email hoặc mật khẩu không đúng"
            });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email
        };

        // Đăng nhập thành công
        res.redirect("/");
    });
});

app.post("/signup", (req, res) => {
    const { username, email, password, repeatPassword } = req.body;

    // 1. Kiểm tra mật khẩu
    if (password !== repeatPassword) {
        return res.render("signup", {
            error: "Mật khẩu nhập lại không khớp"
        });
    }

    // 2. Lưu DB
    const sql = `
        INSERT INTO users (username, email, password)
        VALUES (?, ?, ?)
    `;

    db.run(sql, [username, email, password], function (err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.render("signup", {
                    error: "Email đã tồn tại"
                });
            }

            return res.render("signup", {
                error: "Có lỗi xảy ra, vui lòng thử lại"
            });
        }

        // 3. Thành công
        res.redirect("/signup-success");
    });
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

app.post("/quen-mat-khau", (req, res) => {
    const {email} = req.body;
    const sql = `
        SELECT * FROM users
        WHERE email = ?
    `;
    db.get(sql, [email], (err, user) => {
        if (err) {
            return res.render("quen-mat-khau", {
                error: "Lỗi hệ thống"
            });
        }

        if (!user) {
            return res.render("quen-mat-khau", {
                error: "Email chưa được đăng ký"
            });
        }

        res.redirect("/password-success");
    });
});

app.post("/search", (req, res) => {
    //TODO
    res.redirect("/search-result");
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}/`);
});

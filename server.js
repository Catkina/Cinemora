const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('accounts.db');
const session = require("express-session");
const axios = require("axios");

const TMDB_API_KEY = "ee72791a15af4a6c3623d3371888a72e";
const app = express();
const PORT = 3000;

db.run("PRAGMA foreign_keys = ON");

async function getMovies() {
  const res = await axios.get(
    "https://api.themoviedb.org/3/movie/popular",
    {
      params: {
        api_key: TMDB_API_KEY,
        language: "vi-VN"
      }
    }
  );

  return res.data.results;
}

async function seedMovies() {
  try {
    const movies = await getMovies();

    for (const movie of movies) {
      const detail = await getMovieDetail(movie.id);

      const localMovieId = await new Promise((resolve, reject) => {
        db.run(
          `
          INSERT INTO movies
          (tmdb_id, title, original_title, overview, poster_path, release_date, rating, vote_count, language)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title = excluded.title,
            original_title = excluded.original_title,
            overview = excluded.overview,
            poster_path = excluded.poster_path,
            release_date = excluded.release_date,
            rating = excluded.rating,
            vote_count = excluded.vote_count,
            language = excluded.language
          `,
          [
            movie.id,
            movie.title,  
            detail.original_title,       
            movie.overview,
            movie.poster_path,
            movie.release_date,
            movie.vote_average,
            movie.vote_count,
            detail.original_language
          ],
          function (err) {
            if (err) return reject(err);

            // insert mới
            if (this.lastID) return resolve(this.lastID);

            // đã tồn tại → lấy id cũ
            db.get(
              `SELECT id FROM movies WHERE tmdb_id = ?`,
              [movie.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row.id);
              }
            );
          }
        );
      });

      // insert genres
      for (const genreId of movie.genre_ids) {
        db.run(
          `
          INSERT OR IGNORE INTO movie_genres (movie_id, genre_id)
          VALUES (?, ?)
          `,
          [localMovieId, genreId]
        );
      }
    }

    console.log("Seed movies thành công!");
  } catch (err) {
    console.error("Seed movies lỗi:", err.message);
  }
}

async function seedGenres() {
  const res = await axios.get(
    "https://api.themoviedb.org/3/genre/movie/list",
    {
      params: {
        api_key: TMDB_API_KEY,
        language: "vi-VN"
      }
    }
  );

  const genres = res.data.genres;

  genres.forEach((genre) => {
    const slug = genre.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-");

    db.run(
      `
      INSERT OR IGNORE INTO genres (id, name, slug)
      VALUES (?, ?, ?)
      `,
      [genre.id, genre.name, slug]
    );
  });

  console.log("Seed genres thành công!");
}

async function getMovieDetail(tmdbId) {
  const res = await axios.get(
    `https://api.themoviedb.org/3/movie/${tmdbId}`,
    {
      params: {
        api_key: TMDB_API_KEY,
        language: "en-US"
      }
    }
  );
  return res.data;
}



// TẠO CSDL USER
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// TẠO CSDL MOVIES
db.run(`
    CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        tmdb_id INTEGER UNIQUE NOT NULL,   -- id từ TMDB
        title TEXT NOT NULL,
        original_title TEXT,
        overview TEXT,
        poster_path TEXT,

        release_date TEXT,
        rating REAL,
        vote_count INTEGER,
        language TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// TẠO CSDL GENRES
db.run(`
    CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY,     -- ID genre TMDB (28, 12, ...)
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE
    );
`)

//TẠO CSDL MOVIE-GENRE
db.run(`
    CREATE TABLE IF NOT EXISTS movie_genres (
        movie_id INTEGER,
        genre_id INTEGER,

        PRIMARY KEY (movie_id, genre_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id),
        FOREIGN KEY (genre_id) REFERENCES genres(id)
    );
`)

db.serialize(() => {
  db.get(`SELECT COUNT(*) as count FROM movies`, async (err, row) => {
    if (err) {
      console.error(err.message);
      return;
    }

    if (row.count === 0) {
      await seedGenres();
      await seedMovies();
    }
  });
});

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

app.get("/", async (req, res) => {
    res.render("index", {
      user: req.session.user || null,
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
        user: req.session.user || null,
        q: ""
    });
});

app.get("/search-result", (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === "") {
    return res.render("search-result", {
      user: req.session.user || null,
      movies: [],
      q: ""
    });
  }

  const sql = `
    SELECT *
    FROM movies
    WHERE title LIKE ?
    ORDER BY rating DESC
    LIMIT 30
  `;

  db.all(sql, [`%${q}%`], (err, movies) => {
    if (err) {
      console.error(err);
      return res.status(500).send("DB error");
    }

    res.render("search-result", {
      user: req.session.user || null,
      movies,
      q
    });
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
  const { q } = req.body;
  res.redirect(`/search-result?q=${encodeURIComponent(q)}`);
});

app.get("/phim", (req, res) => {
  const { lang, genre } = req.query;

  let sql = `
    SELECT DISTINCT m.*
    FROM movies m
    LEFT JOIN movie_genres mg ON m.id = mg.movie_id
    WHERE 1 = 1
  `;

  const params = [];

  if (lang) {
    sql += ` AND m.language = ?`;
    params.push(lang);
  }

  if (genre) {
    sql += ` AND mg.genre_id = ?`;
    params.push(genre);
  }

  sql += ` ORDER BY m.rating DESC LIMIT 30`;

  db.all(sql, params, (err, movies) => {
    if (err) {
      console.error(err);
      return res.status(500).send("DB error");
    }

    res.render("trang-ds", {
      user: req.session.user || null,
      movies,
      lang,
      genre
    });
  });
});

// db.all("SELECT id, * FROM movies LIMIT 3", [], (err, rows) => {
//   console.log(rows);
// });

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}/`);
});

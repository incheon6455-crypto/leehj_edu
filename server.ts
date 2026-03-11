import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("database.sqlite");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    tags TEXT,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    location TEXT,
    is_past INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    images TEXT -- JSON string of image URLs
  );

  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed initial data if empty
const postCount = db.prepare("SELECT COUNT(*) as count FROM posts").get() as { count: number };
const postSeeds = [
  {
    title: "교육 혁신을 위한 첫걸음",
    content: "오늘 교육감 예비후보 이현준은 서울 교육의 미래를 위한 정책 발표회를 가졌습니다...",
    date: new Date().toISOString(),
    tags: "정책,발표",
    image_url: "https://picsum.photos/seed/post1/800/400",
  },
  {
    title: "학부모 간담회, 현장 의견 청취",
    content: "학부모들과 함께 기초학력과 돌봄 정책에 대해 깊이 있는 대화를 나눴습니다.",
    date: new Date(Date.now() - 86400000).toISOString(),
    tags: "간담회,학부모",
    image_url: "https://picsum.photos/seed/post2/800/400",
  },
  {
    title: "디지털 교육 전환 로드맵 발표",
    content: "AI 기반 학습 환경 조성을 위한 단계별 실행 계획을 공개했습니다.",
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    tags: "디지털,정책",
    image_url: "https://picsum.photos/seed/post3/800/400",
  },
  {
    title: "교사 정책 간담회 개최",
    content: "교권 보호와 수업 혁신을 위한 실질적 지원책을 중심으로 논의했습니다.",
    date: new Date(Date.now() - 86400000 * 3).toISOString(),
    tags: "교사,현장",
    image_url: "https://picsum.photos/seed/post4/800/400",
  },
];

if (postCount.count < 4) {
  const existingTitles = new Set(
    (db.prepare("SELECT title FROM posts").all() as Array<{ title: string }>).map((p) => p.title)
  );
  const insertPost = db.prepare("INSERT INTO posts (title, content, date, tags, image_url) VALUES (?, ?, ?, ?, ?)");
  for (const post of postSeeds) {
    if (existingTitles.size >= 4) break;
    if (existingTitles.has(post.title)) continue;
    insertPost.run(post.title, post.content, post.date, post.tags, post.image_url);
    existingTitles.add(post.title);
  }
}

if (postCount.count === 0) {
  db.prepare("INSERT INTO events (title, description, date, location) VALUES (?, ?, ?, ?)").run(
    "시민과의 대화",
    "교육 현장의 목소리를 직접 듣습니다.",
    new Date(Date.now() + 86400000 * 2).toISOString(),
    "광화문 광장"
  );
  db.prepare("INSERT INTO photos (title, description, date, thumbnail_url, images) VALUES (?, ?, ?, ?, ?)").run(
    "초등학교 급식 봉사 현장",
    "아이들과 함께 즐거운 점심 시간을 보냈습니다.",
    new Date().toISOString(),
    "https://picsum.photos/seed/photo1/400/300",
    JSON.stringify(["https://picsum.photos/seed/photo1/800/600", "https://picsum.photos/seed/photo1b/800/600"])
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get("/api/stats", (req, res) => {
    const totalVisitors = db.prepare("SELECT SUM(count) as total FROM visitors").get() as { total: number };
    const postCount = db.prepare("SELECT COUNT(*) as count FROM posts").get() as { count: number };
    const eventCount = db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    res.json({
      visitors: totalVisitors.total || 0,
      posts: postCount.count,
      events: eventCount.count
    });
  });

  app.post("/api/visit", (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO visitors (date, count) VALUES (?, 1)
      ON CONFLICT(date) DO UPDATE SET count = count + 1
    `).run(today);
    res.sendStatus(200);
  });

  app.get("/api/posts", (req, res) => {
    const posts = db.prepare("SELECT * FROM posts ORDER BY date DESC").all();
    res.json(posts);
  });

  app.post("/api/posts", (req, res) => {
    const { title, content, date, tags, image_url } = req.body;
    db.prepare("INSERT INTO posts (title, content, date, tags, image_url) VALUES (?, ?, ?, ?, ?)").run(
      title, content, date, tags, image_url
    );
    res.sendStatus(201);
  });

  app.get("/api/events", (req, res) => {
    const events = db.prepare("SELECT * FROM events ORDER BY date ASC").all();
    res.json(events);
  });

  app.post("/api/events", (req, res) => {
    const { title, description, date, location } = req.body;
    db.prepare("INSERT INTO events (title, description, date, location) VALUES (?, ?, ?, ?)").run(
      title, description, date, location
    );
    res.sendStatus(201);
  });

  app.get("/api/photos", (req, res) => {
    const photos = db.prepare("SELECT * FROM photos ORDER BY date DESC").all();
    res.json(photos.map((p: any) => ({ ...p, images: JSON.parse(p.images) })));
  });

  app.post("/api/photos", (req, res) => {
    const { title, description, date, thumbnail_url, images } = req.body;
    db.prepare("INSERT INTO photos (title, description, date, thumbnail_url, images) VALUES (?, ?, ?, ?, ?)").run(
      title, description, date, thumbnail_url, JSON.stringify(images)
    );
    res.sendStatus(201);
  });

  app.post("/api/contact", (req, res) => {
    const { name, phone, message } = req.body;
    db.prepare("INSERT INTO contacts (name, phone, message) VALUES (?, ?, ?)").run(name, phone, message);
    res.sendStatus(201);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

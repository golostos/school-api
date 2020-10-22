require('dotenv').config()
const express = require("express");
const cors = require("cors");
const path = require('path')
const crypto = require('crypto')

const app = express();

const { Sequelize, DataTypes } = require("sequelize");
const sequelize = new Sequelize(process.env.DB, process.env.DB_USER, process.env.DB_PASS, {
  host: "localhost",
  dialect: "mysql",
});

const fieldType = () => ({
  type: DataTypes.STRING,
  allowNull: false,
});
const MessageModel = sequelize.define("Message", {
  username: fieldType(),
  email: fieldType(),
  message: fieldType(),
}, {});

(async function () {
  try {
    await sequelize.authenticate();
    console.log("Connection has been established successfully.");
    await sequelize.sync(/*{ force: true }*/);
    console.log("All models were synchronized successfully.");
    main();
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }
})();

function main() {
  const clients = new Map()
  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, './apiinfo.html'))
  });

  app.post("/api/chat", (req, res, next) => {
    const authHeader = req.get('Authorization')
    if (authHeader && authHeader.length) {
      const token = authHeader.replace(/(bearer|jwt)\s+/, '')
      if (token === process.env.TOKEN) {
        return next()
      }
    }
    next({ error: "Wrong token" })
  },
    async (req, res, next) => {
      const { username, email, message } = req.body;
      try {
        await MessageModel.create({ username, email, message });
        res.json({ username, email, message })
        next()
      } catch (error) {
        next({ error: 'Can\'t create the message in the DB' })
      }
    },
    (req, res, next) => {
      const { username, email, message } = req.body;
      for (const client of clients.values()) {
        client.write(`data: ${JSON.stringify({ username, email, message })}\n\n`);
      }
    }
  );

  app.get("/api/chat", async (req, res, next) => {
    try {
      const messages = await MessageModel.findAll({ order: [['id', 'DESC']], limit: 10 })
      res.json(messages)
    } catch (error) {
      next({ error: 'Can\'t read messages from the DB' })
    }
  })

  app.get("/api/chat/subscribe", (req, res) => {
    const current_date = (new Date()).valueOf().toString();
    const random = Math.random().toString();
    const id = crypto.createHash('sha1').update(current_date + random).digest('hex').slice(0, 10);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Type", "text/event-stream");
    res.flushHeaders(); // flush the headers to establish SSE with client
    clients.set(id, res)

    // If client closes connection, stop sending events
    res.on("close", () => {
      console.log("client dropped me");
      clients.delete(id)
      res.end();
    });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(401).json(err);
  })

  app.listen(process.env.PORT, () => {
    console.log(`Server started on ${process.env.PORT} port`);
  });
}

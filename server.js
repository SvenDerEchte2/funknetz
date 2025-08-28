import express from "express";
import { PeerServer } from "peer";

const app = express();

// Statische Dateien (HTML, JS, Sounds) bereitstellen
app.use(express.static("public"));

// PeerJS-Server unter /funk einbinden
const peerServer = PeerServer({
  port: process.env.PORT || 3000,
  path: "/funk",
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});

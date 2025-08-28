import express from "express";
import { ExpressPeerServer } from "peer";

const app = express();
app.use(express.static("public")); // dein public-Ordner

const PORT = process.env.PORT || 3000;

// PeerJS über Express mounten
const peerServer = ExpressPeerServer(app, { path: '/funk' });
app.use('/funk', peerServer);

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});

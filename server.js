const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const srv = http.createServer((q, r) => {
  r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  r.end(fs.readFileSync(path.join(__dirname, 'index.html')));
});
const wss = new WebSocketServer({ server: srv });

wss.on('connection', ws => {
  let c, closed = false;
  const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
  const u = d => ({ id: d.uniqueId, name: d.nickname || d.uniqueId, pic: d.profilePictureUrl });

  ws.on('message', m => {
    let user; try { user = JSON.parse(m).user; } catch { return; }
    if (!user || c) return;
    c = new WebcastPushConnection(String(user).replace('@', ''));

    c.on('gift', d => {
      if (d.giftType === 1 && !d.repeatEnd) return; // count streaks once, at the end
      const n = d.repeatCount || 1;
      send({ t: 'gift', ...u(d), gift: d.giftName, n, dia: (d.diamondCount || 0) * n, img: d.giftPictureUrl });
    });
    c.on('chat', d => send({ t: 'chat', ...u(d), text: d.comment }));
    c.on('like', d => send({ t: 'like', ...u(d), n: d.likeCount || 1 }));
    c.on('member', d => send({ t: 'join', ...u(d) }));
    c.on('follow', d => send({ t: 'follow', ...u(d) }));
    c.on('share', d => send({ t: 'share', ...u(d) }));
    c.on('roomUser', d => send({ t: 'views', n: d.viewerCount }));

    const go = async () => {
      if (closed) return;
      try { await c.connect(); send({ t: 'status', ok: 1 }); }
      catch (e) { send({ t: 'status', ok: 0, err: String(e.message || e) }); setTimeout(go, 5000); }
    };
    c.on('disconnected', () => { send({ t: 'status', ok: 0 }); setTimeout(go, 3000); });
    go();
  });
  ws.on('close', () => { closed = true; try { c && c.disconnect(); } catch {} });
});

srv.listen(process.env.PORT || 3000, () => console.log('Running'));

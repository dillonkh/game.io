const Quadtree = require("@timohausmann/quadtree-js");
const Express = require("express")();
const Http = require("http").Server(Express);
const Socketio = require("socket.io")(Http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const RUNNER_TO_TAGGER_RATIO = 4 / 5;
const gameState = {
  players: {},
};

let runners = new Map();
let gameOver = false;

const canvasHeight = 480;
const canvasWidth = 750;
let quadTree = null;
let numPlayers = 0;

Http.listen(3000, () => {
  console.log("Listening at :3000...");
});

Socketio.on("connection", (socket) => {
  socket.on("disconnect", () => {
    console.log("user disconnected: ", socket.id);
    if (gameState.players[socket.id]) {
      numPlayers--;
    }
    delete gameState.players[socket.id];
  });

  socket.on("newPlayer", () => {
    console.log("new player");
    let tagger = isTagger();
    gameState.players[socket.id] = {
      x: 250,
      y: 250,
      width: 20,
      height: 20,
      color: getPlayerColor(tagger),
      tagger: tagger,
      frozen: false,
    };
    if (!tagger) {
      runners.set(socket.id, true);
    }
    numPlayers++;
  });

  socket.on("movePlayer", (playerMovement) => {
    const player = gameState.players[socket.id];
    if (quadTree) {
      quadTree.clear();
    }

    for (var p in gameState.players) {
      if (gameState.players[p] != player) {
        if (!quadTree) {
          quadTree = new Quadtree(gameState.players[p]);
        } else {
          quadTree.insert(gameState.players[p]);
        }
      }
    }

    let candidates = [];
    if (player) {
      if (quadTree) {
        candidates = quadTree.retrieve(player);
      }
      for (let c in candidates) {
        if (
          player.x - 10 < candidates[c].x + 10 &&
          player.x + 10 > candidates[c].x - 10 &&
          player.y - 10 < candidates[c].y + 10 &&
          player.y + 10 > candidates[c].y - 10
        ) {
          if (!player.tagger && candidates[c].tagger) {
            player.color = getFrozenColor();
            player.frozen = true;
            socket.emit("freeze");
            runners.delete(socket.id);
          } else if (!player.tagger && player.frozen && !candidates[c].tagger) {
            player.color = getRunnerColor();
            player.frozen = false;
            socket.emit("thaw");
            runners.set(socket.id, true);
          }
        }
      }

      if (runners.size == 0 && !gameOver) {
        Socketio.sockets.emit("gameOver");
        gameOver = true;
      }

      if (playerMovement.up && player.y > 0) {
        player.y -= 1.5;
      }
      if (playerMovement.down && player.y < canvasHeight - player.height) {
        player.y += 1.5;
      }
      if (playerMovement.left && player.x > 0) {
        player.x -= 1.5;
      }
      if (playerMovement.right && player.x < canvasWidth - player.width) {
        player.x += 1.5;
      }
    }
  });
});

getRandomColor = () => {
  let red = Math.floor(Math.random() * 255) + 100; // 100 - 255;
  let green = Math.floor(Math.random() * 255) + 100; // 100 - 255;
  let blue = Math.floor(Math.random() * 255) + 100; // 100 - 255;

  let color = `${"rgb(" + red + ", " + green + ", " + blue + ")"}`;
  return color;
};

getPlayerColor = (tagger) => {
  if (tagger) {
    return "rgb(212, 2, 2)";
  } else {
    return "rgb(40, 212, 2)";
  }
};

isTagger = () => {
  console.log(runners.size, numPlayers);
  if (numPlayers < 1) {
    return false;
  }
  if (runners.size / numPlayers > RUNNER_TO_TAGGER_RATIO) {
    return true;
  } else {
    return false;
  }
};

getFrozenColor = () => {
  return "rgb(2, 156, 212)";
};
getRunnerColor = () => {
  return "rgb(40, 212, 2)";
};

setInterval(() => {
  Socketio.sockets.emit("state", gameState);
}, 1000 / 60);

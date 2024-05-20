/**
 * A simple nodejs script which launches an orbitdb instance and creates a db
 * with a single record.
 *
 * To run from the terminal:
 *
 * ```bash
 * node index.js
 * ```
 * or
 * ```bash
 * node index.js /orbitdb/<hash>
 * ```
 */
import { createHelia } from "helia";
import { createOrbitDB, OrbitDBAccessController } from "@orbitdb/core";
import { createLibp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import { mdns } from "@libp2p/mdns";
import { yamux } from "@chainsafe/libp2p-yamux";
import { tcp } from "@libp2p/tcp";

import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { LevelBlockstore } from "blockstore-level";

const libp2pOptions = {
  peerDiscovery: [mdns()],
  addresses: {
    listen: [
      "/ip4/0.0.0.0/tcp/0",
      "/ip6/::/tcp/0",
    //   "/ip4/0.0.0.0/udp/0/quic",
    //   "/ip6/::/udp/0/quic",
    ],
  },
  bootstrap: {
    enabled: false,
  },
  transports: [tcp()],
  connectionEncryption: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    pubsub: gossipsub({ emitSelf: true }),
  },
};

const id = process.argv.length > 2 ? 2 : 1;

const blockstore = new LevelBlockstore(`./ipfs/${id}`);

const libp2p = await createLibp2p(libp2pOptions);

const ipfs = await createHelia({ libp2p, blockstore });

const orbitdb = await createOrbitDB({
  ipfs,
  id: `nodejs-${id}`,
  directory: `./orbitdb/${id}`,
});

let db;

console.log(ipfs.libp2p.peerId.toString());

if (process.argv.length > 2) {
  const remoteDBAddress = process.argv.pop();

  db = await orbitdb.open(remoteDBAddress);

  await db.add(`hello world from peer ${id}`);

  for await (const res of db.iterator()) {
    console.log(res);
  }
} else {
  db = await orbitdb.open("nodejs", {
    AccessController: OrbitDBAccessController({ write: ["*"] }),
  });

  console.log(db.address);

  db.events.on("update", (event) => {
    console.log("update", event);
  });
}

// List all the peers as and when they are discovered
if (libp2p && libp2p.peerStore && typeof libp2p.peerStocre.on === "function") {
  libp2p.peerStore.on("change:multiaddrs", (peerId) => {
    console.log("Discovered:", peerId.toB58String());
  });
} else {
  console.error(
    "libp2p or libp2p.peerStore is not initialized correctly or on is not a function"
  );
}

process.on("SIGINT", async () => {
  console.log("exiting...");

  await db.close();
  await orbitdb.stop();
  await ipfs.stop();
  process.exit(0);
});

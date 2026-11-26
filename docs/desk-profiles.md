# Sound desk profiles

Lampstand reads and sets a digital desk's channel processing (EQ, low and high cut, gate,
compressor) over the network, using the desk's own OSC control protocol. What it needs to know
about a desk is data, not code: a **profile**. Two are built in (`packages/core/src/desk.ts`,
`BUILT_IN_DESKS`): the Behringer X32 / Midas M32 family and the Behringer X Air / Midas MR
family, written from Behringer's published OSC documentation and checked against a simulated
desk, **not yet on a real one**.

Any other desk that speaks OSC over UDP works with a profile file, imported in Settings › Audio ›
Sound desk › Import a desk profile. Desks that are controlled over MIDI (Allen & Heath) or their
own protocol (Yamaha) need a new transport (the profile's `transport` field leaves room for one).

## The file

```json
{
  "format": "lampstand-desk-profile",
  "version": 1,
  "profile": {
    "id": "my-desk",
    "name": "My desk",
    "note": "Where this came from, and what was tested.",
    "transport": "osc-udp",
    "port": 10023,
    "channels": 32,
    "channelFormat": "pad2",
    "bandFormat": "plain",
    "probe": "/info",
    "channelName": "/ch/{ch}/config/name",
    "eq": {
      "on": { "address": "/ch/{ch}/eq/on", "type": "i" },
      "bands": 4,
      "type": {
        "address": "/ch/{ch}/eq/{band}/type",
        "kinds": { "lowCut": 0, "lowShelf": 1, "bell": 2, "highShelf": 4, "highCut": 5 }
      },
      "hz": { "address": "/ch/{ch}/eq/{band}/f", "scale": "log", "min": 20, "max": 20000 },
      "db": { "address": "/ch/{ch}/eq/{band}/g", "scale": "lin", "min": -15, "max": 15 },
      "q": { "address": "/ch/{ch}/eq/{band}/q", "scale": "log", "min": 10, "max": 0.3 }
    },
    "lowCut": {
      "on": { "address": "/ch/{ch}/preamp/hpon" },
      "hz": { "address": "/ch/{ch}/preamp/hpf", "scale": "log", "min": 20, "max": 400 },
      "slopes": [12]
    },
    "gate": {
      "on": { "address": "/ch/{ch}/gate/on" },
      "threshold": { "address": "/ch/{ch}/gate/thr", "scale": "lin", "min": -80, "max": 0 }
    },
    "comp": {
      "on": { "address": "/ch/{ch}/dyn/on" },
      "threshold": { "address": "/ch/{ch}/dyn/thr", "scale": "lin", "min": -60, "max": 0 },
      "ratio": { "address": "/ch/{ch}/dyn/ratio", "scale": "steps", "steps": [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 100], "type": "i" },
      "attack": { "address": "/ch/{ch}/dyn/attack", "scale": "lin", "min": 0, "max": 120 },
      "release": { "address": "/ch/{ch}/dyn/release", "scale": "log", "min": 5, "max": 4000 },
      "makeup": { "address": "/ch/{ch}/dyn/mgain", "scale": "lin", "min": 0, "max": 24 }
    }
  }
}
```

- **Addresses** are templates: `{ch}` is the channel (`pad2`: `04`, `plain`: `4`), `{band}` the
  EQ band. Only `/`, letters, digits, `_ . -` and the two placeholders are allowed.
- **Values**: `lin` and `log` map `min`…`max` (a log scale may run high to low, as an X32's Q
  does). `normalized` (default true) means the desk takes 0…1 for that range; set it false for a
  desk that takes the value itself. `steps` sends the index of the nearest of `steps`. On/off
  switches are sent as int 0/1 (`"type": "f"` for float).
- **Reading**: Lampstand sends each address with no arguments and takes the desk's reply (the
  usual OSC query). `probe` is any address the desk answers, used by Check.
- **Optional parts** (`channelName`, `eq.type`, `lowCut`, `highCut`, `gate`, `comp`): leave out
  what the desk doesn't have. Sending then says what was left out (for example "There's no
  gate"), and the EQ is fitted to the desk's band count and shapes (`fitProcessing`).

Everything a profile drives is pure and tested in `packages/core/src/desk.test.ts`; the network
side is `apps/desktop/src/main/desk/deskLink.ts` (tested against a pretend desk on UDP).

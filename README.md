# herdr-mention

Mods for the [Herdr](https://herdr.dev) desktop app.

## Mention

`@` a pane, write what you want it to do, press Enter. `@@` reaches every agent on every space and machine. Free panes get the message now, working panes get it when their turn ends, and a pane that is waiting on you is never typed over.

![Mention](mention/preview.png)

Tell your agent:

```
Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/Lu7h0r/herdr-mention
```

Or install it by hand:

```sh
./install.sh            # copies mods/mention into ~/.config/herdr-app and binds ctrl-shift-m
```

The brief another agent could rebuild it from is [`mention/RECIPE.md`](mention/RECIPE.md).

### What it needs

- Herdr desktop app with `hc` (herdr-core) on the PATH. Delivery uses `hc send` and, for a working pane, `hc wait`.
- Optional: the Kolczyk spaces mod. When present, the popup shows its icon for the space.

### Disclosure

The mod types into other agents' terminals through `hc send`. It never forces a blocked agent: a pane waiting on you is skipped with a warning.

## License

MIT. `at-sign.svg` is from [Lucide](https://lucide.dev) (ISC).

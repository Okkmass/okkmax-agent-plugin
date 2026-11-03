# OkkMax Agent Plugin

OkkMax Agent Plugin lets compatible AI clients query OkkMax relay measurements, including model availability, observed prices, uptime and purity results.

## What is included

- Remote read-only MCP server `okkmax` at https://www.okkmax.com/mcp (Streamable HTTP, no sign-in, no API key). Tools: `search_stations`, `search_models`, `get_model_board`, `find_cheapest_relay`, `get_station`, `explain_methodology`.
- Skill `okkmax-find-relay`: choose and compare relays for one model.
- Skill `okkmax-check-relay`: check one named relay.

The plugin has no hooks, no write operations and no credentials. It does not start any detection run.

## Install

**Claude plugin** (Claude Code):

```
/plugin marketplace add Okkmass/okkmax-agent-plugin
/plugin install okkmax@okkmax
```

**Claude Code, MCP only:**

```
claude mcp add --transport http --scope user okkmax https://www.okkmax.com/mcp
```

**Codex, MCP and Skills:**

```
codex mcp add okkmax --url https://www.okkmax.com/mcp
for n in okkmax-find-relay okkmax-check-relay; do mkdir -p ~/.agents/skills/$n && curl -fsSL https://www.okkmax.com/agent-kit/skills/$n/SKILL.md -o ~/.agents/skills/$n/SKILL.md; done
```

**ChatGPT and OpenAI:** `plugin.json` and `mcp.json` in this repository are the package used for OpenAI plugin submissions. Until the plugin is listed in a directory you can use, add the MCP server URL below in any ChatGPT or OpenAI client that supports remote MCP servers.

**Any MCP client:** Streamable HTTP, no authentication:

```
https://www.okkmax.com/mcp
```

An agent can also set everything up by itself from https://www.okkmax.com/agent-kit/install.md.

## Examples

- Find the lowest observed CNY input price for Claude Sonnet 5.5 among relays with at least 99% uptime.
- Check whether grooroute has direct purity measurements for Claude Sonnet 5.5.
- Explain how OkkMax measures relay uptime and purity.

## Data boundaries

- Data covers only the relays OkkMax currently tracks.
- All tools are read-only.
- Prices, uptime and purity results carry a `dataAsOf` time.
- A model or group that has not been tested is reported as not tested. That does not mean it is safe, genuine or pure.
- The lowest observed price is the lowest among the tracked candidates that match the filters. It is not the lowest price on the market.
- Buying, top-ups, refunds and account actions are not supported.

## Links

- Website: https://www.okkmax.com
- Developers: https://www.okkmax.com/developers
- Installation guide: https://www.okkmax.com/agent-kit/install.md
- Support: https://www.okkmax.com/support
- Privacy policy: https://www.okkmax.com/privacy
- Terms of service: https://www.okkmax.com/terms

## License

The MIT License applies only to the files published in this repository. OkkMax website code, service data, measurement infrastructure, scoring systems, hosted APIs and other non-repository materials are not licensed under this repository.

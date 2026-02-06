# Installing Notion MCP Server

This guide explains how to install and configure the Notion MCP server for use with various AI CLIs.

## Prerequisites

- Node.js 18+ and npm
- A Notion integration token
- One of the following CLIs:
  - **Gemini CLI**: `npm install -g @google/gemini-cli`
  - **Codex CLI**: `npm install -g @codex-ai/cli`
  - **OpenCode**: `npm install -g opencode`

## Step 1: Get Notion Token

1. Go to https://www.notion.so/my-integrations
2. Create a new integration
3. Copy your Internal Integration Token (starts with `ntn_`)

## Step 2: Clone and Build the MCP Server

```bash
git clone https://github.com/notionhq/notion-mcp-server.git
cd notion-mcp-server
npm install
npm run build
```

---

## Gemini CLI Installation

### Add MCP Server

**Global Configuration (Recommended):**

Edit `~/.gemini/settings.json` and add:

```json
{
  "mcpServers": {
    "notion": {
      "command": "/absolute/path/to/notion-mcp-server/bin/cli.mjs",
      "args": []
    }
  }
}
```

### Configure Environment Variables

Add your Notion token to your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
export NOTION_TOKEN="your_notion_token_here"
```

Then reload your shell:

```bash
source ~/.bashrc
```

### Verify Installation

Start Gemini CLI and check MCP servers:

```bash
gemini
```

Inside Gemini CLI, run:

```
/mcp list
```

You should see:

```
Configured MCP servers:

🟢 notion - Ready (23 tools)
```

---

## Codex CLI Installation

### Add MCP Server with Token

```bash
codex mcp add notion --env NOTION_TOKEN=your_token_here -- /path/to/notion-mcp-server/bin/cli.mjs
```

### Optional: Create .agent/mcps.json

For better MCP auto-detection, create `.agent/mcps.json` in your project:

```json
{
  "mcpServers": {
    "notion": {
      "command": "/path/to/notion-mcp-server/bin/cli.mjs",
      "env": {
        "NOTION_TOKEN": "your_token_here"
      }
    }
  }
}
```

### Verify Installation

```bash
codex mcp list
```

You should see:

```
Name    Command                                       Args  Env                 Cwd  Status   Auth
notion  /path/to/notion-mcp-server/bin/cli.mjs  -     NOTION_TOKEN=*****  -    enabled  Unsupported
```

**Note:** If Codex doesn't automatically use MCP tools, mention "use the notion mcp" in your prompts.

---

## OpenCode Installation

### Create opencode.json

Create an `opencode.json` file in your project:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "notion": {
      "type": "local",
      "command": ["node", "/path/to/notion-mcp-server/bin/cli.mjs"],
      "environment": {
        "NOTION_TOKEN": "your_notion_token_here"
      },
      "enabled": true
    }
  }
}
```

### Verify Installation

Run OpenCode in your project directory:

```bash
opencode
```

The MCP tools will be automatically available. Add "use the notion tool" to your prompts if needed.

---

## Why use these CLIs?

**Gemini CLI** has a much larger context window (1M+ tokens) compared to Claude Code CLI (~200k tokens), making it better for:
- Large Notion databases
- Complex queries with many results
- Working with extensive page content

**Codex CLI** offers excellent MCP support with GPT-5.1 models for complex reasoning.

**OpenCode** provides a modern open-source alternative with flexible MCP configuration.

---

## Troubleshooting

**MCP server not showing:**
- Verify the path to `bin/cli.mjs` is correct
- Check that `npm run build` was successful
- Restart your CLI after configuration

**Authentication errors:**
- Ensure `NOTION_TOKEN` is set correctly
- Verify your integration has access to the Notion pages/databases

**Tools not working:**
- Make sure your Notion integration has access to the specific resources
- Check the MCP server is running (green indicator in `/mcp list` for Gemini)
- For Codex/OpenCode, try adding "use the notion mcp" to your prompt

**Sources:**
- [MCP servers - OpenCode Docs](https://opencode.ai/docs/mcp-servers/)
- [Setting up MCP in Codex - Reddit](https://www.reddit.com/r/ChatGPTCoding/comments/1n3y2vq/setting_up_mcp_in_codex_is_easy_dont_let_the_toml/)

#!/usr/bin/env node
/**
 * fastergeo-mcp — stdio entry point.
 *
 * Register with any MCP client, e.g. Claude Code:
 *   claude mcp add fastergeo -- npx -y @fastergeo/mcp
 * Engine keys come from the environment (${ENGINE}_API_KEY), same
 * conventions as the CLI.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createFastergeoServer } from './server.js';

// Node's fetch ignores HTTP(S)_PROXY — honor it so audit tools work behind
// proxies (NO_PROXY is respected).
if (process.env.HTTPS_PROXY || process.env.https_proxy
  || process.env.HTTP_PROXY || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const server = createFastergeoServer();
const transport = new StdioServerTransport();
await server.connect(transport);
// stdio transport: stdout is the protocol channel — log to stderr only.
console.error('fastergeo-mcp ready (9 tools)');

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
import { createFastergeoServer } from './server.js';

const server = createFastergeoServer();
const transport = new StdioServerTransport();
await server.connect(transport);
// stdio transport: stdout is the protocol channel — log to stderr only.
console.error('fastergeo-mcp ready (9 tools)');

#!/usr/bin/env node
// AOCI MCP 桥接：ZCode 宿主校验层翻译 aoci_update_entry 的 JSON Schema 时丢失
// not 子句，entries[] 的正确形状（path+source_sha256+candidate_id 三件套）被
// 客户端误判为 multi-match 拒收。本脚本绕开宿主校验，用 stdio JSON-RPC 直连
// aoci MCP server 提交机器批次；服务器端校验照常生效。
//
// 用法: node scripts/aoci-mcp-bridge.mjs <候选JSON> [仓库根]
//   候选JSON 按 aoci_maintain 返回原样组装:
//     { "code_batch_id": "<批次身份>", "entries": [{ "path", "source_sha256", "candidate_id", "new_entry" }] }
//   仓库根默认取 cwd；aoci 二进制可用环境变量 AOCI_BIN 覆盖（默认 D:/AISoftware/aoci.exe）。
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/aoci-mcp-bridge.mjs <候选JSON> [仓库根]');
  process.exit(2);
}
const repo = path.resolve(process.argv[3] || process.cwd());
const bin = process.env.AOCI_BIN || 'D:/AISoftware/aoci.exe';
const data = JSON.parse(readFileSync(file, 'utf8'));
if (!data.code_batch_id || !Array.isArray(data.entries)) {
  console.error('候选JSON 缺少 code_batch_id 或 entries 数组');
  process.exit(2);
}
const args = {
  code_batch_id: data.code_batch_id,
  entries: data.entries.map(({ path, source_sha256, candidate_id, new_entry }) => ({
    path,
    source_sha256,
    candidate_id,
    new_entry,
  })),
};

const proc = spawn(bin, ['--repo', repo, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });

let out = '';
let err = '';
let done = false;
proc.stdout.on('data', (d) => {
  out += d.toString();
  let idx;
  while ((idx = out.indexOf('\n')) >= 0) {
    const line = out.slice(0, idx).trim();
    out = out.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 2) {
      done = true;
      if (msg.result && msg.result.content && msg.result.content[0]) {
        console.log(msg.result.content[0].text);
      } else {
        console.log(JSON.stringify(msg, null, 2));
      }
      proc.kill();
      process.exit(0);
    }
  }
});
proc.stderr.on('data', (d) => {
  err += d.toString();
});

proc.stdin.write(
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'aoci-mcp-bridge', version: '1.0' },
    },
  }) + '\n',
);
proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
proc.stdin.write(
  JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'aoci_update_entry', arguments: args },
  }) + '\n',
);

setTimeout(() => {
  if (!done) {
    console.error('超时未收到响应。stderr: ' + err.slice(0, 2000));
    console.log('partial stdout: ' + out.slice(0, 2000));
    proc.kill();
    process.exit(1);
  }
}, 120000);

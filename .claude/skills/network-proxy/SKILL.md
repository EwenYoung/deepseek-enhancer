---
name: network-proxy
description: Configure HTTP/HTTPS proxy (127.0.0.1:7897) before network-accessing commands, unset after completion.
---

# /network-proxy

Agent 执行需要访问网络的命令时，先设置代理，完成后取消。

## Usage

网络操作前：
```bash
export http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897
```

网络操作完成后取消：
```bash
unset http_proxy https_proxy
```

## 适用场景

- `pnpm install` / `pnpm update`
- `git clone` / `git fetch` / `git pull`
- `curl` / `wget`
- 任何访问外部网络的命令
- 本地操作不需要（git status、pnpm build 等）

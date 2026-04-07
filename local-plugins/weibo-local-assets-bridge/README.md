# Weibo Local Assets Bridge

Desktop-only Obsidian plugin that receives Weibo clips from a local Web Clipper build on `127.0.0.1:27124` and stores remote Weibo images as local attachments.

## Install

1. Copy this folder into your vault:
   `.obsidian/plugins/weibo-local-assets-bridge`
2. Enable the plugin in Obsidian.
3. Use the custom Web Clipper build from the sibling `obsidian-clipper-save-weibo-images` directory.

## Current behavior

- Listens on `127.0.0.1:27124`
- Accepts `POST /api/weibo-clip`
- Saves images into `90 Assets/Web Clipper/<note-name>/`
- Rewrites markdown image links to `![[...]]`
- Supports create/overwrite/append-specific/prepend-specific note writes

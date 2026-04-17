---
name: Bug report
about: Something isn't working the way the docs say it should
title: ''
labels: bug
assignees: ''
---

**What happened?**

A clear description of what went wrong.

**What did you expect to happen?**

**How to reproduce**

1.
2.
3.

**Environment**

- Node.js version:
- Operating system:
- MCP client (Claude Desktop / Cowork / Cursor / other):
- Deployment (local / Docker / Kubernetes / serverless):

**Logs**

Please include relevant log output. Set `LOG_LEVEL=debug` for verbose output. **Redact your credentials and bearer tokens before pasting.**

```
<paste logs here>
```

**Checklist**

- [ ] I confirmed my Adobe enterprise account has Firefly Services API access enabled
- [ ] I confirmed my `FIREFLY_CLIENT_ID` and `FIREFLY_CLIENT_SECRET` are valid
- [ ] I confirmed my MCP client is reaching the server (bearer token accepted, healthcheck passes)
- [ ] I searched existing issues before filing

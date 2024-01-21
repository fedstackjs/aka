---
outline: deep
---

# 配置说明

## 环境变量

Aka 从环境变量中读取配置。需要如下的环境变量：

```ini
# Runner ID
AKA_RUNNER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Runner Key
AKA_RUNNER_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
# AOI Server的URL
AKA_SERVER=https://some.aoi.server/
# AKA使用的MongoDB的URL
AKA_MONGO_URL=mongodb://localhost:27017/aka
```

## SystemD

若使用SystemD管理进程，你需要有一个安装了NVM的用户。

创建文件 `/etc/systemd/system/aka.service` 如下：

```ini
[Unit]
Description=Aka Ranker
After=network.target syslog.target
Wants=network.target

[Service]
User=<User>
Group=<Group>
Type=simple
Environment=NODE_VERSION=20
Environment=AKA_RUNNER_ID=<Runner ID>
Environment=AKA_RUNNER_KEY=<Runner Key>
Environment=AKA_SERVER=<Server URL>
Environment=AKA_MONGO_URL=<MongoDB URL>
WorkingDirectory=/home/<User>/
ExecStart=/home/<User>/.nvm/nvm-exec npx --yes @aoi-js/aka

[Install]
WantedBy=multi-user.target
```

你需要把所有的`<...>`替换为你自己的值。

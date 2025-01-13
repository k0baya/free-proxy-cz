# Free Proxy List

自动抓取和维护SOCKS5代理服务器列表的工具。

## 功能特点

- 自动抓取全球SOCKS5代理
- 定期检测代理可用性
- 支持按国家筛选代理
- 提供REST API接口
- 自动备份历史数据
- 多线程并发检测
- 支持忽略SSL证书错误

## 环境要求

- Node.js >= 14
- npm >= 6

## 安装

```bash
# 克隆仓库
git clone https://github.com/k0baya/free-proxy-cz.git
cd free-proxy-cz

# 安装依赖
npm install
```

## 运行

基本运行:
```bash
node app.js
```

设置环境变量运行:
```bash
# 检查指定国家的代理
CHECK_COUNTRY=CN CHECK_TARGET=https://www.baidu.com node app.js

# 检查所有国家的代理
CHECK_TARGET=https://www.google.com node app.js
```

## 环境变量

- `CHECK_COUNTRY`: 要检查的国家代码（可选）
- `CHECK_TARGET`: 代理检测目标URL（默认：https://www.baidu.com）
- `PORT`: API服务器端口（默认：3000）

## API接口

服务器默认运行在 `http://localhost:3000`

### 获取所有地区信息
```bash
curl http://localhost:3000/region
```

### 获取随机代理
```bash
curl http://localhost:3000/proxy
```

### 获取指定国家的随机代理
```bash
curl http://localhost:3000/proxy-CN  # 中国
curl http://localhost:3000/proxy-US  # 美国
```

## 数据管理

- 代理数据保存在 `list.json`
- 每24小时自动更新一次数据
- 更新时旧数据会被备份为 `list-YYYY-MM-DD.json`
- 每5分钟检查一次代理可用性
- 自动清理无效代理

## 代理数据格式

```json
{
  "anonymous": "High anonymity",
  "region": "China Beijing Beijing",
  "type": "SOCKS5",
  "uptime": "95.8%",
  "proxy": "1.2.3.4:1080"
}
```

## 注意事项

1. 首次运行会抓取所有国家的代理，可能需要较长时间
2. 代理检测使用多线程，可能会占用较多系统资源
3. 建议使用PM2等工具保持程序持续运行
4. 默认忽略SSL证书错误以提高检测成功率
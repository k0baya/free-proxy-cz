const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const express = require('express');
const app = express();

// Base64 decode function that we'll need since the site uses it
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

async function extractProxiesFromPage($) {
  const proxies = [];
  
  // Process each table row
  $('#proxy_list tbody tr').each((index, element) => {
    try {
      // Skip advertisement rows
      if ($(element).find('td[colspan]').length) return;

      // Extract base64 encoded IP
      const base64IP = $(element).find('td:nth-child(1) script').text()
        .match(/Base64\.decode\("(.+?)"\)/)?.[1];
      if (!base64IP) return;

      const ip = decodeBase64(base64IP);
      const port = $(element).find('td:nth-child(2) .fport').text();
      const type = $(element).find('td:nth-child(3) small').text();
      const country = $(element).find('td:nth-child(4)').text().trim();
      const region = $(element).find('td:nth-child(5) small').text();
      const city = $(element).find('td:nth-child(6) small').text();
      const anonymous = $(element).find('td:nth-child(7) small').text();
      const uptime = $(element).find('td:nth-child(9) small').text();

      proxies.push({
        anonymous: anonymous,
        region: `${country} ${region} ${city}`.trim(),
        type: type,
        uptime: uptime,
        proxy: `${ip}:${port}`
      });
    } catch (err) {
      console.error('Error processing row:', err);
    }
  });

  return proxies;
}

async function extractCountries($) {
  const countries = {};
  $('#frmsearchFilter-country option').each((_, element) => {
    const option = $(element);
    const value = option.attr('value');
    const text = option.text();
    // Skip "All countries" option
    if (value !== 'all') {
      const name = text.replace(/\s*\((\d+)\)$/, '').trim();
      const count = text.match(/\((\d+)\)$/)?.[1] || '0';
      countries[`${name}/${value}`] = count;
    }
  });
  return countries;
}

async function getProxies() {
  try {
    const baseUrl = 'https://free-proxy.cz/en/proxylist/country';
    let proxyData = {
      timeStamp: Date.now(),
      country: {},
      proxies: {}
    };

    // 先获取中国的代理和国家列表
    console.log('Fetching initial data from China...');
    let currentPage = 1;
    let totalPages = 1;
    let firstCountry = true;

    // 获取或初始化现有数据
    if (fs.existsSync('list.json')) {
      proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
    }

    // 处理所有国家
    const processCountry = async (countryCode) => {
      console.log(`\nProcessing country: ${countryCode}`);
      currentPage = 1;
      totalPages = 1;

      while (true) {
        console.log(`Fetching page ${currentPage} for ${countryCode}...`);
        
        if (currentPage > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        try {
          const pageUrl = currentPage === 1 
            ? `${baseUrl}/${countryCode}/socks5/uptime/all`
            : `${baseUrl}/${countryCode}/socks5/uptime/all/${currentPage}`;

          const response = await axios.get(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });

          const $ = cheerio.load(response.data);
          
          // 只在第一次运行时获取国家列表
          if (firstCountry && currentPage === 1) {
            proxyData.country = await extractCountries($);
            firstCountry = false;
          }
          
          // 获取总页数
          if (currentPage === 1) {
            const lastPageLink = $('.paginator a').not(':contains("Next")').last().attr('href');
            if (lastPageLink) {
              totalPages = parseInt(lastPageLink.split('/').pop());
            }
            console.log(`Found ${totalPages} total pages for ${countryCode}`);
          }

          const pageProxies = await extractProxiesFromPage($);
          
          // 更新代理列表
          if (pageProxies.length > 0) {
            if (!proxyData.proxies[countryCode]) {
              proxyData.proxies[countryCode] = {
                socks5: []
              };
            }
            proxyData.proxies[countryCode].socks5.push(...pageProxies);
            
            // 增量保存到文件
            fs.writeFileSync('list.json', JSON.stringify(proxyData, null, 2));
            console.log(`Page ${currentPage}: Saved ${pageProxies.length} proxies for ${countryCode}`);
          }

        } catch (err) {
          // 静默跳过请求错误，继续下一个处理
          break;
        }

        if (currentPage >= totalPages) break;
        currentPage++;
      }

      // 如果该国家没有代理，从country中删除
      if (!proxyData.proxies[countryCode]?.socks5?.length) {
        delete proxyData.proxies[countryCode];
        const countryKey = Object.keys(proxyData.country).find(key => key.endsWith(`/${countryCode}`));
        if (countryKey) {
          delete proxyData.country[countryKey];
        }
        // 保存更新后的数据
        fs.writeFileSync('list.json', JSON.stringify(proxyData, null, 2));
        console.log(`Removed empty country: ${countryCode}`);
      }
    };

    // 首先处理中国
    await processCountry('CN');

    // 然后处理其他国家
    const countryKeys = Object.keys(proxyData.country);
    for (const countryKey of countryKeys) {
      const countryCode = countryKey.split('/')[1];
      if (countryCode !== 'CN') {
        await processCountry(countryCode);
      }
    }

    console.log(`\nCompleted processing all countries. Final country count: ${Object.keys(proxyData.country).length}`);

  } catch (error) {
    console.error('Error fetching proxies:', error);
  }
}

// 备份数据文件
function backupListJson(timeStamp) {
  const date = new Date(timeStamp);
  const backupFileName = `list-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.json`;
  fs.renameSync('list.json', backupFileName);
  console.log(`Backed up old data to ${backupFileName}`);
}

// 检查数据是否需要更新
function needsUpdate(proxyData) {
  if (!proxyData.timeStamp) return true;
  const now = Date.now();
  const hours = (now - proxyData.timeStamp) / (1000 * 60 * 60);
  return hours >= 24;
}

// 代理检测函数
async function checkProxy(proxy, target, retries = 3) {
  const [host, port] = proxy.split(':');
  const config = {
    proxy: {
      host,
      port,
      protocol: 'socks5:'
    },
    timeout: 10000,
    validateStatus: null,
    httpsAgent: new (require('https').Agent)({
      rejectUnauthorized: false  // 忽略SSL证书错误
    })
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(target, config);
      return response.status >= 200 && response.status < 1000;
    } catch (error) {
      if (i === retries - 1) return false;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

// 并发检测函数
async function batchCheckProxies(proxies, target, threads = 16) {
  const results = [];
  for (let i = 0; i < proxies.length; i += threads) {
    const batch = proxies.slice(i, i + threads);
    const checks = batch.map(proxy => checkProxy(proxy.proxy, target));
    const batchResults = await Promise.all(checks);
    results.push(...batchResults);
  }
  return results;
}

// 代理清理函数
async function cleanupProxies(proxyData, country, target) {
  // 如果未指定国家，检查所有国家的代理
  if (!country) {
    console.log('Checking proxies for all countries...');
    for (const countryCode in proxyData.proxies) {
      const proxies = proxyData.proxies[countryCode]?.socks5;
      if (!proxies || proxies.length === 0) continue;

      console.log(`\nChecking ${proxies.length} proxies for ${countryCode}...`);
      const results = await batchCheckProxies(proxies, target);
      const validProxies = proxies.filter((_, index) => results[index]);
      
      if (validProxies.length === 0) {
        delete proxyData.proxies[countryCode];
        const countryKey = Object.keys(proxyData.country).find(key => key.endsWith(`/${countryCode}`));
        if (countryKey) {
          delete proxyData.country[countryKey];
        }
        console.log(`Removed empty country: ${countryCode}`);
      } else {
        proxyData.proxies[countryCode].socks5 = validProxies;
        console.log(`Valid proxies for ${countryCode}: ${validProxies.length}/${proxies.length}`);
      }
      
      // 每个国家处理完后保存一次
      fs.writeFileSync('list.json', JSON.stringify(proxyData, null, 2));
    }
    console.log(`\nCompleted checking all countries. Remaining countries: ${Object.keys(proxyData.proxies).length}`);
    return;
  }

  // 单一国家的处理逻辑保持不变
  if (!proxyData.proxies[country]?.socks5) {
    console.log(`No proxies found for country: ${country}`);
    return;
  }

  const proxies = proxyData.proxies[country].socks5;
  console.log(`Checking ${proxies.length} proxies for ${country}...`);

  const results = await batchCheckProxies(proxies, target);
  const validProxies = proxies.filter((_, index) => results[index]);

  console.log(`Valid proxies: ${validProxies.length}/${proxies.length}`);
  proxyData.proxies[country].socks5 = validProxies;

  fs.writeFileSync('list.json', JSON.stringify(proxyData, null, 2));
}

// API路由处理函数
function setupApiRoutes() {
  // API文档路由
  app.get('/', (req, res) => {
    res.json({
      message: `
Available endpoints:
1. GET /region
   Returns a list of all countries with their proxy counts
   Example: curl http://localhost:3000/region

2. GET /proxy
   Returns a random proxy from all available proxies across all countries
   Example: curl http://localhost:3000/proxy

3. GET /proxy-{countryCode}
   Returns a random proxy from the specified country. Country code should be in uppercase
   Example: curl http://localhost:3000/proxy-CN (get a proxy from China)
   Example: curl http://localhost:3000/proxy-US (get a proxy from United States)
      `
    });
  });

  // 返回所有地区信息
  app.get('/region', (req, res) => {
    try {
      const proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
      res.json(proxyData.country);
    } catch (error) {
      res.status(500).json({ error: 'Failed to read proxy data' });
    }
  });

  // 返回随机代理
  app.get('/proxy', (req, res) => {
    try {
      const proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
      const allProxies = [];
      
      // 收集所有代理
      Object.values(proxyData.proxies).forEach(countryData => {
        if (countryData.socks5 && countryData.socks5.length > 0) {
          allProxies.push(...countryData.socks5);
        }
      });

      if (allProxies.length === 0) {
        return res.status(404).json({ error: 'No proxies available' });
      }

      // 随机选择一个代理
      const randomProxy = allProxies[Math.floor(Math.random() * allProxies.length)];
      res.json(randomProxy);
    } catch (error) {
      res.status(500).json({ error: 'Failed to read proxy data' });
    }
  });

  // 返回指定国家的随机代理
  app.get('/proxy-:country', (req, res) => {
    try {
      const country = req.params.country.toUpperCase();
      const proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
      
      if (!proxyData.proxies[country] || !proxyData.proxies[country].socks5) {
        return res.status(404).json({ error: `No proxies available for country: ${country}` });
      }

      const countryProxies = proxyData.proxies[country].socks5;
      if (countryProxies.length === 0) {
        return res.status(404).json({ error: `No proxies available for country: ${country}` });
      }

      // 随机选择一个代理
      const randomProxy = countryProxies[Math.floor(Math.random() * countryProxies.length)];
      res.json(randomProxy);
    } catch (error) {
      res.status(500).json({ error: 'Failed to read proxy data' });
    }
  });

  // 404处理 - 必须放在所有路由之后
  app.use((req, res) => {
    res.status(404).json({
      message: "Endpoint not found. Visit '/' for available API endpoints and usage instructions."
    });
  });

  // 启动服务器
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
    console.log('Visit http://localhost:' + port + ' for API documentation');
  });
}

// 主函数
async function main() {
  // 从环境变量读取配置
  const checkCountry = process.env.CHECK_COUNTRY || '';
  const checkTarget = process.env.CHECK_TARGET || 'https://www.baidu.com';

  // 首次运行抓取代理
  let proxyData;
  if (fs.existsSync('list.json')) {
    proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
    if (needsUpdate(proxyData)) {
      backupListJson(proxyData.timeStamp);
      await getProxies();
    }
  } else {
    await getProxies();
  }

  // 启动API服务器
  setupApiRoutes();

  // 定期检查代理
  setInterval(async () => {
    try {
      console.log(`\n[${new Date().toISOString()}] Starting proxy check...`);
      
      // 读取并检查数据是否需要更新
      proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
      if (needsUpdate(proxyData)) {
        console.log('Data is older than 24 hours, updating...');
        backupListJson(proxyData.timeStamp);
        await getProxies();
        proxyData = JSON.parse(fs.readFileSync('list.json', 'utf8'));
      }

      await cleanupProxies(proxyData, checkCountry, checkTarget);
    } catch (error) {
      console.error('Error during proxy check:', error);
    }
  }, 300000);
}

// 启动程序
main().catch(console.error);

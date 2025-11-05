### AliGoat-Bot

Automates product tracking across AliExpress, GOAT, and shipping status via 17track.

## 🚀 What this project does

- Monitors items listed on AliExpress and GOAT and automatically checks shipping/tracking status via 17track.

- Enables timely alerts/updates on package movement and purchase status.

- Offers a modular architecture to support additional marketplaces or shipping providers in future.

## 🎯 Why I built it

In many e-commerce workflows, manually checking item listings, shipment updates and tracking across platforms is tedious.
This bot streamlines that process and demonstrates my abilities in:

- Web automation & scraping

- API integrations and asynchronous workflows

- Designing extensible architecture

- Deploying and maintaining a lightweight, event-driven tool

## 🧩 Key Features & Highlights

- Multi-platform support: Interfaces with AliExpress, GOAT and 17track (shipping aggregator).
- Extensible architecture: Clear separation of concerns (crawler/helper/database modules) → easier to add new sources.

- Real-world data flows: Handles live tracking updates, status change detection, and triggers for notifications.

- Configurable: via .env file for credentials, endpoints, tracking settings.


## 💡 Architecture & Tech Stack

Language: 
 - JavaScript (Node.js) — for rapid implementation and plenty of existing libraries.
 - Puppeteer - For browser manipulation

### Folder Structure:

```
config/
database/
helper/
resources/
src/
```

### Main modules:

- crawler/ - modules that scrape or fetch marketplace data

- helper/ - utility functions (e.g., parsing, normalization)

- database/ - persistence of items, status logs, etc

- Environment config: .env.default … copy to .env with appropriate variables

### Platforms Supported:

- AliExpress

- GOAT

- 17track tracking updates

### Workflow:

- Poll or ingest new listings from marketplaces

- For each item, check shipment/tracking status via 17track

- Detect status changes (e.g., shipped, in-transit, delivered)

- Persist updates to database and send trigger/notification (customizable)

### Why these decisions:

- JavaScript/Node.js(v12) for asynchronous I/O (network requests)

- Modular code to separate marketplace logic from tracking logic, enabling future growth

- Lightweight database layer to keep history of statuses and enable diff comparisons

### 📥 Installation & Setup

Clone the repository:

```
git clone https://github.com/joppx25/aliexpress-goat-bot.git
```

```
cd aliexpress-goat-bot
```


#### Copy and configure environment variables:

```
cp .env.default .env
```


#### Then edit .env with your API keys, endpoints, database configurations, etc.

Install dependencies:

```
npm install
```


#### Launch the bot:

```bash
# Example getting aliexpress data
npm run aliexpress:get-data

# Few options you can provide in the command:
# -f = to force create a new product
# -s = store id
# -a = target ali id
# -r = scrape product with the reviews
# -d = getting product description
# -b = verbose
```

```bash
# Example getting Goat data
npm run goat:get-data

# Few options you can provide in the command:
# -l = Searching product sku, psku, page
# -p = search product for specific page
# -f = to force create a new product
```



## 🙌 How to Contribute

Contributions are welcome!

Fork the repository & create your branch: feature/<your-feature>

Ensure code adheres to existing style and is commented/documented.

Submit a pull request describing your changes and reasoning.

Report issues or suggest enhancements via GitHub issues.

## ⚠️ License & Disclaimer

Please note that this project interacts with third-party services and may involve web scraping or API usage. These services can change their interfaces, rate limits, or terms of use at any time. Use this project responsibly and ensure compliance with each platform’s policies.

This repository is no longer actively maintained, and some parts of the code may not function as originally intended due to API or site changes.
If you’re interested in reviving, improving, or learning from this project, feel free to reach out to me — I’d be happy to provide insights or advice on how to get it running again.

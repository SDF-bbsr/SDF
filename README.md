
# 🤖 AI-Powered Retail Operations Platform

An advanced, full-stack retail management solution designed to streamline inventory, sales, and vendor operations for a dry fruit business. This platform leverages AI-driven insights to provide actionable recommendations, optimize stock levels, and analyze performance, empowering managers and staff to make data-informed decisions.



### ✨ **[Live Demo](https://dryfruit-manager.vercel.app/)**
*(Note: The live demo is in read-only mode.)*

---

## 🚀 Tech Stack

The project is built with a modern, robust, and scalable technology stack.

| Category         | Technology                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**     | ![Next.js](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white) ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) |
| **Backend/DB**   | ![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase)                                                                                                                                                                                                                                                                                     |
| **AI**           | ![Google Gemini](https://img.shields.io/badge/Google%20Gemini-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)                                                                                                                                                                                                                                                                                                 |
| **UI Components**| ![Shadcn/UI](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)  ![Lucide React](https://img.shields.io/badge/lucide%20react-333?style=for-the-badge)                                                                                                                                                                    |
| **Data & Charts**| ![Recharts](https://img.shields.io/badge/recharts-18a8b8?style=for-the-badge) ![ExcelJS](https://img.shields.io/badge/ExcelJS-207245?style=for-the-badge)                                                                                                                                                                                                                                                                      |
| **Deployment**   | ![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)                                                                                                                                                                                                                                                                                                                         |

---

## 🌟 Key Features

The application is divided into two primary user-facing sections: the **Manager CRM** and the **Vendor Point-of-Sale (POS)**.

### 🏪 Vendor Point-of-Sale (POS) System

A streamlined interface for vendors to handle daily sales and returns efficiently.

*   **Sale Entry**: Fast item lookup via barcode scanner (`html5-qrcode`), manual barcode entry, or bulk additions.
*   **Vendor Sales Dashboard**: A personalized dashboard for vendors to track their daily sales figures and progress towards weekly targets.
*   **Returns Management**: Simple workflow to find and process customer returns for items sold.

<details>
<summary><b>🖼️ View POS Screenshots</b></summary>
<br>
  
![image](https://github.com/user-attachments/assets/a61b31e9-c98b-4dda-9575-7a15128f50bf)
![image](https://github.com/user-attachments/assets/f87156d4-5ad9-4c54-8be8-82e501f04cf2)
![image](https://github.com/user-attachments/assets/3a85e64d-e79e-4ed3-8c65-6f1152549cf6)


</details>

---

### 📊 Manager CRM & Analytics Dashboard

A comprehensive control center for managers to oversee all aspects of the retail operation, featuring powerful AI-driven analytics.

#### 🧠 AI-Powered Insights
*   **Daily Briefing**: Starts the day with an AI-generated summary, including a sales forecast, actionable recommendations (e.g., staffing adjustments for holidays), and an analysis of recent sales trends.
*   **AI Product Performance Analyzer**: Automatically categorizes products into `Standout Performers`, `Underperformers`, `Rising Stars`, and `Cooling Off` based on recent performance shifts.
*   **AI Restock Insight**: Proactively identifies products with low or negative stock levels, flagging tracking errors and providing replenishment recommendations.

#### 📈 Sales & Performance Tracking
*   **Central Dashboard**: At-a-glance view of total sales, sales by staff, 30-day sales trends, and sales by hour.
*   **Sales Log**: Detailed log of all transactions, filterable by date and staff. Includes daily summaries and an **advanced data export** feature to generate custom Excel or text reports.
*   **Staff Performance**: In-depth analysis of individual staff performance with metrics like total sales value, packets sold, and average value per packet, visualized with trend graphs.

#### 🛍️ Item & Product Intelligence
*   **Profit Quadrant Analysis**: A BCG Matrix-style classification of products into `Stars`, `Cash Cows`, `Opportunities`, and `Problem Children` to guide strategic decisions.
*   **Price Sweet Spot**: An AI-powered card that identifies the most effective price range for top-selling products.
*   **Item Performance View**: Filterable reports on item sales with charts showing top items by value/weight and sales distribution.

#### 📦 Inventory & Product Management
*   **Stock Status**: Combines AI insights with a detailed **Monthly Stock Ledger** that tracks opening stock, restocks, sales, and closing stock for every item.
*   **Product Management**: A full CRUD interface to manage the entire product catalog, including details like article name, HSN code, pricing, and taxes.

#### 🎯 Target & Incentive System
*   A dedicated module for setting weekly sales targets for staff, tracking their progress, and viewing earned incentives.

<details>
<summary><b>🖼️ View Manager CRM Screenshots</b></summary>
<br>

![image](https://github.com/user-attachments/assets/0fabdc59-eb7d-4090-95b4-5c1ea7f72cdd)
![image](https://github.com/user-attachments/assets/69211b24-bfc6-4ab3-af65-20924cbc640d)
![image](https://github.com/user-attachments/assets/dd6c0544-a736-4aa8-b4d2-0c3411ea02af)
![image](https://github.com/user-attachments/assets/acaa86a3-d507-4408-99ae-095f6f339f05)
![image](https://github.com/user-attachments/assets/f4719c9b-14ee-4e5d-ae16-2ff947fabf92)
![image](https://github.com/user-attachments/assets/0b0d9e5d-9813-431a-a1ba-aea77ca725a6)
![image](https://github.com/user-attachments/assets/befbee6e-71e7-44be-a2b7-a8e4af5c6124)
![image](https://github.com/user-attachments/assets/ef375f96-05ce-44c2-8e22-172db49a80b8)



</details>

---

## 🛠️ Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   Node.js (v20 or later)
*   npm or yarn

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/RITESHP36/dryfruit-inventory-manager.git
    cd dryfruit-inventory-manager
    ```

2.  **Install NPM packages:**
    ```sh
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root of your project and add the necessary environment variables. See the section below for the required keys.

4.  **Run the development server:**
    ```sh
    npm run dev
    ```

## 🔑 Environment Variables

You will need to create a `.env.local` file and add your configuration details from Firebase and Google AI Studio.

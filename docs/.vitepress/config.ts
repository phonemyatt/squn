import { defineConfig } from "vitepress";

export default defineConfig({
  title: "squn",
  description: "Type-safe SQL query library for Bun",

  // Set VITE_BASE=/squn/ in CI for GitHub Pages project sites
  base: process.env.VITE_BASE ?? "/",

  head: [["link", { rel: "icon", href: "/favicon.ico" }]],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/" },
      { text: "GitHub", link: "https://github.com/phonemyatt/squn" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Adapters", link: "/guide/adapters" },
            { text: "Configuration", link: "/guide/config" },
          ],
        },
        {
          text: "Core",
          items: [
            { text: "SQL Authoring", link: "/guide/sql-authoring" },
            { text: "Querying", link: "/guide/querying" },
            { text: "Execute & Batch", link: "/guide/execute" },
            { text: "Prepared Queries", link: "/guide/prepared" },
            { text: "Transactions", link: "/guide/transactions" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Type Definitions", link: "/guide/types" },
            { text: "Query Builder", link: "/guide/query-builder" },
            { text: "Mapping", link: "/guide/mapping" },
            { text: "Multi-DB", link: "/guide/multi-db" },
            { text: "Error Handling", link: "/guide/error-handling" },
            { text: "Readonly Mode", link: "/guide/readonly" },
            { text: "TVP (MSSQL)", link: "/guide/tvp" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [{ text: "Index", link: "/api/" }],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/phonemyatt/squn" },
    ],

    search: { provider: "local" },

    footer: {
      message: "Released under the MIT License.",
    },
  },
});

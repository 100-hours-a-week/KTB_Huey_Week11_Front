import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "../basic.css";
import "../index.css";
import "../view.css";
import "../modal.css";
import "../user.css";
import "./react.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>,
);

import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { RouteFocus } from "../components/common/RouteFocus";
import { DemoBanner } from "../components/common/DemoBanner";
import { PayPalLogo } from "../components/common/PayPalLogo";
import Placeholder from "../pages/Placeholder";
import PaymentReturn from "../pages/PaymentReturn";
import ApprovePay from "../pages/ApprovePay";
import Dashboard from "../pages/Dashboard";
import CreateRequest from "../pages/CreateRequest";
import RequestDetail from "../pages/RequestDetail";
import Comparison from "../pages/Comparison";
import Recommendation from "../pages/Recommendation";
import QuoteReview from "../pages/QuoteReview";
import Summary from "../pages/Summary";

export default function App() {
  return (
    <BrowserRouter>
      <a className="skip noprint" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to main content</a>
      <RouteFocus />
      <DemoBanner />
      <nav className="noprint" aria-label="Main"><PayPalLogo className="paypal-logo" /> <Link to="/">Dashboard</Link> <Link to="/requests/new">New request</Link> <Link to="/history">History</Link></nav>
      <div id="main" tabIndex={-1}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/requests/new" element={<CreateRequest />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/requests/:id/compare" element={<Comparison />} />
        <Route path="/requests/:id/recommendation" element={<Recommendation />} />
        <Route path="/requests/:id/approve" element={<ApprovePay />} />
        <Route path="/quotes/:qid/review" element={<QuoteReview />} />
        <Route path="/requests/:id/summary" element={<Summary />} />
        <Route path="/history" element={<Dashboard history />} />
        <Route path="/payments/return" element={<PaymentReturn />} />
        <Route path="/payments/cancel" element={<PaymentReturn cancelled />} />
        <Route path="*" element={<Placeholder title="Page not found" />} />
      </Routes>
      </div>
    </BrowserRouter>
  );
}

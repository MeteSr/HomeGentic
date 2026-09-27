// Low-traffic public pages, lazy-loaded together from App.tsx through this one
// module so they ship as a single chunk — ten separate chunks gzip ~12KB worse.
export { default as PrivacyPolicyPage }    from "./PrivacyPolicyPage";
export { default as TermsOfServicePage }   from "./TermsOfServicePage";
export { default as SupportPage }          from "./SupportPage";
export { default as FAQPage }              from "./FAQPage";
export { default as GiftPage }             from "./GiftPage";
export { default as ContractorVerifyPage } from "./ContractorVerifyPage";
export { default as ForProsPage }          from "./ForProsPage";
export { default as PaymentSuccessPage }   from "./PaymentSuccessPage";
export { default as PaymentFailurePage }   from "./PaymentFailurePage";
export { default as SampleReportPage }     from "./SampleReportPage";

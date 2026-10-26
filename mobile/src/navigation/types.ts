import type { NavigatorScreenParams } from "@react-navigation/native";
import type { Property } from "../services/propertyService";
import type { Lead } from "../services/contractorService";
import type { SignableJob, SignRole } from "../services/signJobService";

export type HomeownerTabParamList = {
  Home:     undefined;
  Property: undefined;
  Jobs:     { jobId?: string } | undefined;
  Upkeep:   undefined;
  Account:  undefined;
};

export type ContractorTabParamList = {
  Leads:     { leadId?: string } | undefined;
  Sign:      undefined;
  Earnings:  undefined;
  CAccount:  undefined;
};

export type RootStackParamList = {
  Tabs:           NavigatorScreenParams<HomeownerTabParamList> | NavigatorScreenParams<ContractorTabParamList> | undefined;
  People:         undefined;
  Upgrade:        undefined;
  AddRecurring:   { propertyId: string };
  PropertyDetail: { property: Property };
  LogJob:         { propertyId: string; propertyAddress: string; prefill?: Partial<import("../services/jobFormService").JobForm> };
  QuoteRequest:   { propertyId: string; propertyAddress: string };
  MyQuotes:       { propertyId?: string; propertyAddress?: string; requestId?: string };
  CompareBids:    { requestId: string; title: string };
  SignJob:        { job: SignableJob; currentRole: SignRole };
  PhotoUpload:    { jobId: string; propertyId: string; jobServiceType: string };
  BillUpload:     { propertyId: string; propertyAddress: string };
  ScanDocument:   { propertyId: string; propertyAddress: string };
  LeadDetail:     { lead: Lead };
  QueueStatus:    undefined;
  Report:         { token?: string } | undefined;
};

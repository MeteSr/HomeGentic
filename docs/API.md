# HomeGentic API Reference

## Auth Canister

| Method | Type | Description |
|---|---|---|
| `register(RegisterArgs)` | update | Register a new user |
| `getProfile()` | query | Get caller's profile |
| `updateProfile(UpdateArgs)` | update | Update email/phone |
| `hasRole(UserRole)` | query | Check caller's role |
| `getMetrics()` | query | Platform user metrics |

## Property Canister

| Method | Type | Description |
|---|---|---|
| `registerProperty(RegisterPropertyArgs)` | update | Register a new property |
| `getMyProperties()` | query | Get caller's properties |
| `getProperty(Nat)` | query | Get property by ID |
| `verifyProperty(Nat, VerificationLevel)` | update | Admin: verify a property |
| `getPropertyLimitForTier(SubscriptionTier)` | query | Get tier property limit |
| `getMetrics()` | query | Platform property metrics |

## Job Canister

| Method | Type | Description |
|---|---|---|
| `createJob(CreateJobArgs)` | update | Create a maintenance job |
| `getMyJobs()` | query | Get caller's jobs |
| `getJobsByProperty(Nat)` | query | Get jobs for a property |
| `getJob(Nat)` | query | Get job by ID |

## Contractor Canister

| Method | Type | Description |
|---|---|---|
| `register(RegisterArgs)` | update | Register as contractor |
| `getMyProfile()` | query | Get caller's contractor profile |
| `getAll()` | query | List all contractors |

## Quote Canister

| Method | Type | Description |
|---|---|---|
| `createRequest(Nat, Text, Urgency, Text)` | update | Create quote request |
| `getRequest(Nat)` | query | Get request by ID |
| `getMyRequests()` | query | Get caller's requests |

## Price Canister

| Method | Type | Description |
|---|---|---|
| `getPricing(Tier)` | query | Get pricing for a tier |
| `getAllPricing()` | query | Get all tier pricing |

## Payment Canister

| Method | Type | Description |
|---|---|---|
| `subscribe(Tier)` | update | Subscribe to a tier |
| `getMySubscription()` | query | Get caller's subscription |

## Photo Canister

| Method | Type | Description |
|---|---|---|
| `upload(UploadArgs)` | update | Upload a photo hash |
| `getByJob(Nat)` | query | Get photos for a job |
| `getCount(Nat)` | query | Count photos for a job |

## Monitoring Canister

| Method | Type | Description |
|---|---|---|
| `health()` | query | Platform health status |
| `recordMetric(Text, Int)` | update | Record a metric |
| `getMetrics()` | query | Get all metrics |

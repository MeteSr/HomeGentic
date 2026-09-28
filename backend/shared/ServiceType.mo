/// The one ServiceType used by job, quote, contractor, sensor and report.
/// Keep the frontend catalog (frontend/src/services/serviceTypes.ts) in step:
/// every tag here needs a label there, and vice versa.
///
/// Adding a tag changes the stable type of every canister that stores it —
/// that is a stable-memory break unless shipped with a migration.
module {
  public type ServiceType = {
    #Roofing;
    #HVAC;
    #Plumbing;
    #Electrical;
    #Painting;
    #Flooring;
    #Windows;
    #Landscaping;
    #Gutters;
    #GeneralHandyman;
    #Pest;
    #Concrete;
    #Fencing;
    #Insulation;
    #Solar;
    #Pool;
    #Foundation;
    #Drywall;
    #KitchenRemodel;
    #BathroomRemodel;
    #Other;
  };

  /// The tag's name, used where a service type crosses a canister boundary as Text.
  public func toText(s : ServiceType) : Text {
    switch s {
      case (#Roofing)         "Roofing";
      case (#HVAC)            "HVAC";
      case (#Plumbing)        "Plumbing";
      case (#Electrical)      "Electrical";
      case (#Painting)        "Painting";
      case (#Flooring)        "Flooring";
      case (#Windows)         "Windows";
      case (#Landscaping)     "Landscaping";
      case (#Gutters)         "Gutters";
      case (#GeneralHandyman) "GeneralHandyman";
      case (#Pest)            "Pest";
      case (#Concrete)        "Concrete";
      case (#Fencing)         "Fencing";
      case (#Insulation)      "Insulation";
      case (#Solar)           "Solar";
      case (#Pool)            "Pool";
      case (#Foundation)      "Foundation";
      case (#Drywall)         "Drywall";
      case (#KitchenRemodel)  "KitchenRemodel";
      case (#BathroomRemodel) "BathroomRemodel";
      case (#Other)           "Other";
    }
  };

  /// Inverse of toText.
  public func fromText(t : Text) : ?ServiceType {
    switch t {
      case "Roofing"         ?#Roofing;
      case "HVAC"            ?#HVAC;
      case "Plumbing"        ?#Plumbing;
      case "Electrical"      ?#Electrical;
      case "Painting"        ?#Painting;
      case "Flooring"        ?#Flooring;
      case "Windows"         ?#Windows;
      case "Landscaping"     ?#Landscaping;
      case "Gutters"         ?#Gutters;
      case "GeneralHandyman" ?#GeneralHandyman;
      case "Pest"            ?#Pest;
      case "Concrete"        ?#Concrete;
      case "Fencing"         ?#Fencing;
      case "Insulation"      ?#Insulation;
      case "Solar"           ?#Solar;
      case "Pool"            ?#Pool;
      case "Foundation"      ?#Foundation;
      case "Drywall"         ?#Drywall;
      case "KitchenRemodel"  ?#KitchenRemodel;
      case "BathroomRemodel" ?#BathroomRemodel;
      case "Other"           ?#Other;
      case _                 null;
    }
  };
}

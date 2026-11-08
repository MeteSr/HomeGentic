/// #712: the move-in plan a new owner works through in their first weeks.
/// The steps themselves are written by the app (from the home's own data);
/// the canister keeps which ones are done and the tasks the owner added from
/// their purchase inspection. Types and validation only, no state.
import Array "mo:core/Array";
import Insurance "Insurance";
import HouseGuide "HouseGuide";

module {
  public type TaskUrgency = { #Safety; #Repair; #Monitor };

  /// A task the owner reviewed (usually read from the purchase inspection).
  public type TaskInput = {
    title   : Text;
    detail  : Text;
    area    : Text;   // "Electrical", "Roof": the part of the home; may be empty
    urgency : TaskUrgency;
  };

  public type Task = {
    id        : Text;
    title     : Text;
    detail    : Text;
    area      : Text;
    urgency   : TaskUrgency;
    createdAt : Int;
  };

  /// `doneSteps` holds the ids of finished steps: the app's own step ids
  /// ("locks", "homestead") and the ids of finished tasks.
  public type Plan = {
    startedAt : Int;
    doneSteps : [Text];
    tasks     : [Task];
    updatedAt : Int;
  };

  public let MAX_TASKS : Nat = 60;
  public let MAX_TASKS_PER_CALL : Nat = 25;
  public let MAX_DONE : Nat = 100;

  public func fresh(now : Int) : Plan {
    { startedAt = now; doneSteps = []; tasks = []; updatedAt = now }
  };

  /// A step or task id: 1–64 letters, digits, '-' or '_'.
  public let isStepId = HouseGuide.isRefId;

  public func clean(t : TaskInput) : TaskInput {
    {
      t with
      title  = Insurance.trim(t.title);
      detail = Insurance.trim(t.detail);
      area   = Insurance.trim(t.area);
    }
  };

  /// The problem with a (cleaned) task, or null.
  public func validate(t : TaskInput) : ?Text {
    if (t.title.size() == 0)   return ?"Give each task a title";
    if (t.title.size() > 120)  return ?"Task title is over 120 characters";
    if (t.detail.size() > 500) return ?"Task details are over 500 characters";
    if (t.area.size() > 40)    return ?"Task area is over 40 characters";
    null
  };

  /// `plan` with `stepId` marked done or not done. Marking a done step done
  /// again changes nothing (it keeps its place in the order steps were done).
  public func mark(plan : Plan, stepId : Text, done : Bool, now : Int) : Plan {
    if (done and plan.doneSteps.find(func s = s == stepId) != null) return plan;
    let rest = plan.doneSteps.filter(func s = s != stepId);
    { plan with doneSteps = if (done) rest.concat([stepId]) else rest; updatedAt = now }
  };
};

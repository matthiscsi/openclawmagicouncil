import { CouncilMemberPanel } from "./CouncilMemberPanel";
import { CouncilResponse } from "./CouncilResponse";
import { SystemStatus } from "./SystemStatus";
import type { CouncilMachineState, MemberId, RunRoute } from "../types";

type CouncilDisplayProps = {
  state: CouncilMachineState;
  route: RunRoute;
  phaseLabel: string;
  syncLabel: string;
  onInspect: (memberId: MemberId) => void;
  onInspectVerdict: () => void;
};

export function CouncilDisplay({
  state,
  route,
  phaseLabel,
  syncLabel,
  onInspect,
  onInspectVerdict,
}: CouncilDisplayProps) {
  return (
    <section className="council-panel">
      <div className="magi">
        <div className="header left">
          <hr />
          <hr />
          <span>MAGI</span>
          <hr />
          <hr />
        </div>

        <div className="header right">
          <hr />
          <hr />
          <span>{"\u30de\u30ae"}</span>
          <hr />
          <hr />
        </div>

        <SystemStatus
          extensionCode={state.extensionCode}
          phaseLabel={phaseLabel}
          syncLabel={syncLabel}
        />

        <CouncilMemberPanel member={state.members.melchior} onInspect={onInspect} />
        <CouncilMemberPanel member={state.members.balthasar} onInspect={onInspect} />
        <CouncilMemberPanel member={state.members.casper} onInspect={onInspect} />

        <CouncilResponse route={route} aggregation={state.aggregation} onInspectVerdict={onInspectVerdict} />

        <div className="connection casper-balthasar" />
        <div className="connection casper-melchior" />
        <div className="connection balthasar-melchior" />
        <div className="title">MAGI</div>
      </div>
    </section>
  );
}

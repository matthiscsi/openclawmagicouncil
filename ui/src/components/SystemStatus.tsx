import { SYSTEM_COPY } from "../constants";

type SystemStatusProps = {
  extensionCode: string;
  phaseLabel: string;
  syncLabel: string;
};

export function SystemStatus({
  extensionCode,
  phaseLabel,
  syncLabel,
}: SystemStatusProps) {
  return (
    <div className="system-status">
      <div>{SYSTEM_COPY.code}</div>
      <div>{SYSTEM_COPY.file}</div>
      <div>{`EXTENSION:${extensionCode}`}</div>
      <div>{`PHASE:${phaseLabel}`}</div>
      <div>{syncLabel}</div>
      <div>{SYSTEM_COPY.priority}</div>
    </div>
  );
}

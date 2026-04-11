import { STATUS_ENGLISH_LABELS } from "../constants";
import type { FinalCouncilStatus } from "../types";

type TestMatrixRow = {
  id: string;
  label: string;
  prompt: string;
  expected: FinalCouncilStatus;
};

type TestMatrixProps = {
  rows: TestMatrixRow[];
  activeScenarioId: string | null;
  onRun: (scenarioId: string) => void;
};

export function TestMatrix({
  rows,
  activeScenarioId,
  onRun,
}: TestMatrixProps) {
  return (
    <div className="test-matrix">
      <div className="matrix-title">TEST MATRIX</div>
      <div className="matrix-list">
        {rows.map((row) => (
          <div className="matrix-row" key={row.id}>
            <div className="matrix-copy">
              <div className="matrix-row-header">
                <strong>{row.label}</strong>
                <span>{STATUS_ENGLISH_LABELS[row.expected]}</span>
              </div>
              <p>{row.prompt}</p>
            </div>
            <div className="matrix-action">
              <button
                type="button"
                className={activeScenarioId === row.id ? "matrix-button active" : "matrix-button"}
                onClick={() => onRun(row.id)}
              >
                EXECUTE
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

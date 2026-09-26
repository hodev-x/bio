import { Link } from "react-router";
import { Meta } from "../../components/Meta";

export function NotFound() {
  return (
    <div>
      <Meta title="Not found — Daniel Hodeta" />
      <h1>Not found</h1>
      <p><Link to="/">Home</Link></p>
    </div>
  );
}

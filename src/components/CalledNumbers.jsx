export default function CalledNumbers({ called }) {
  return (
    <section className="card history">
      <div className="sectionTitle">
        <div>
          <h3>Called Numbers</h3>
          <p>Same sequence for every player.</p>
        </div>
      </div>

      <div className="calledList">
        {called.length ? (
          called.map((number, index) => (
            <span key={number}>
              <small>{index + 1}</small>
              {number}
            </span>
          ))
        ) : (
          <p className="empty">No numbers selected yet.</p>
        )}
      </div>
    </section>
  );
}
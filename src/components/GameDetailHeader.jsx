const BGG_URL = "https://boardgamegeek.com/boardgame/";

const GameDetailHeader = ({ name, bounds, id, image }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: "1em",
      alignItems: "flex-start",
    }}
  >
    <div>
      <h1>{name}</h1>
      <p>
        {bounds && (
          <>
            <strong>Players:</strong>
            &nbsp;
            {bounds.min}-{bounds.max}
          </>
        )}
      </p>
      <a href={`${BGG_URL}${id}/`} target="_blank">
        BGG Page
      </a>
    </div>
    {image && <img src={image} width="200" />}
  </div>
);

export default GameDetailHeader;

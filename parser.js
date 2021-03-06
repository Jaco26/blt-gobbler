
/**
 * A parser for BLT formatted text OpaVote election results
 * @see https://www.opavote.com/help/overview#blt-file-format 
 * 
 * @returns {{
 *    withdrawnCandidates: number[];
 *    numberOfCandidates: number;
 *    numberOfSeats: number;
 *    ballots: {
 *      weight: number;
 *      rankings: {
 *        rank: number;
 *        candidates: number[];
 *      }[];
 *    }[];
 *    candidates: {
 *      [key: string]: {
 *        name: string;
 *        number: number;  
 *      };
 *    };
 *    electionName: string;
 * }}
 * 
 * A ballot file contains the following information:
 * - The first line has two numbers indicating the number of candidates and the
 *   number of seats.
 * - The second line is the first ballot, and each following line is another 
 *   ballot until you reach the end of ballots marker. Each ballot is a separate
 *   line.
 * - The first number on a ballot line indicates a ballot weight, and for most 
 *   elections, this will always be 1. The last number on a ballot line is 
 *   always 0 to indicate the end of a ballot.
 * - The other numbers on a ballot line indicate the rankings. The second number 
 *   on a ballot line is the candidate number of the first ranked candidate, the 
 *   third number on a ballot line is the candidate number of the second ranked 
 *   candidate, and so forth.
 * - A ballot line of "1 0" is an empty ballot that did not rank any candidates. 
 *   If a ballot ranks 1 candidate, then the ballot line will have 3 numbers. If 
 *   a ballot ranks 4 candidates, then the ballot line will have 6 numbers.
 * - A line with only a 0 is an end of ballots marker and indicates that the 
 *   previous line was the last ballot.
 * - The lines after the end of ballots marker indicate the candidate names in 
 *   double quotes. The number of candidate names must match the number 
 *   indicated on the first line.
 * - The line after the candidate names is the title in double quotes.
 * - Blank lines, extra white space, and any comments (text after a #) are 
 *   ignored.
 * - Be careful with double quotes. They must be straight double quotes (") and 
 *   not curly double quotes (??????).
 * - If you have more than 10,000 ballots, then OpaVote stores the ballots in 
 *   what we call a "packed" format. Only unique ballots are included in the BLT 
 *   file and the weight indicates the number of times that the ballot occurred.
 * 
 * The BLT file format has some other features that may be useful for some 
 * users:
 * - You can indicate withdrawn candidates in the BLT file. To do this, insert 
 *   a line after the first line and before the first ballot. This line lists 
 *   negative candidate numbers to indicate that those candidates have 
 *   withdrawn. E.g., a second line of "-1 -3" indicates that candidates 1 and 
 *   3 have withdrawn.
 * - You can indicate undervotes (also known as skipped rankings) with a hyphen.
 *   E.g., a ballot line of "1 3 - 2 0" indicates that candidate 3 was ranked 
 *   first, no candidate was ranked second, and candidate 2 was ranked third. 
 *   Most counting methods will ignore the skipped ranking and go on to the next 
 *   ranking.
 * - You can indicate duplicate rankings (also known as overvotes) with an equal 
 *   sign. E.g., a ballot line of "1 3=2 1 0" indicates that both candidate 2 
 *   and candidate 3 were ranked first and that candidate 1 was ranked second. 
 *   Most counting methods will ignore the overvote and go on to the next 
 *   ranking.
 * 
 * An annotated example of a BLT file is shown below:
 * ```bash
 *  4 2          # Four candidates are competing for two seats
    -2           # Bob has withdrawn
    1 4 1 3 2 0  # First ballot
    1 3 4 1 2 0  # Chuck first, Amy second, Diane third, Bob fourth
    1 2 4 1 0    # Bob first, Amy second, Diane third
    1 4 3 0      # Amy first, Chuck second
    6 4 3 0      # Amy first, Chuck second with a weight of 6
    1 0          # An empty ballot
    1 2 - 3 0    # Bob first, no one second, Chuck third
    1 2=3 1 0    # Bob and Chuck first, Diane second
    1 2 3 4 1 0  # Last ballot
    0            # End of ballots marker
    "Diane"      # Candidate 1
    "Bob"        # Candidate 2
    "Chuck"      # Candidate 3
    "Amy"        # Candidate 4
    "Gardening Club Election"  # Title
 * ```
 */
function parse(bltText) {
  const cleanedLines = bltText
    .split("\n")
    .map(line => (
      line
        .replace(/#.*$/, "")
        .replace(/"/g, "")
        .trim()
    ))
    .filter(line => line.length > 0);
  
  const [firstLine, ...theOtherLines] = cleanedLines;

  const [numberOfCandidates, numberOfSeats] = firstLine
    .split(" ")
    .map(chars => Number(chars));

  const withdrawnCandidates = /^(-\d+\s*)+$/.test(theOtherLines[0])
      ? theOtherLines.shift()
          .split(" ")
          .filter(chars => chars.trim().length > 0)
          .map(chars => Number(chars.trim().replace("-", "")))
      : [];

  const indexOfEndOfBallots = theOtherLines.findIndex(line => line === "0");

  const ballotLines = theOtherLines.slice(0, indexOfEndOfBallots);

  const candidateLines = theOtherLines.slice(
    indexOfEndOfBallots + 1,
    theOtherLines.length - 1
  );

  const electionName = theOtherLines[theOtherLines.length - 1];

  const candidates = candidateLines.reduce(
    (accumulator, line, index) => {
      const candidate = {
        name: line,
        number: index + 1,
      };
      accumulator[candidate.number] = candidate;
      return accumulator
    },
    {}
  );

  function processRankings(candidateRankings) {
    const isTie = ranking => /^\d+=\d+$/.test(ranking);
    const isSkip = ranking => ranking === "-"

    return candidateRankings.map((ranking, index) => {
      const rank = index + 1;

      if (isTie(ranking)) {
        return {
          rank,
          candidates: ranking.split("=").map(candidate => Number(candidate)),
        };
      }

      if (isSkip(ranking)) {
        return { rank, candidates: [] };
      }
      
      return { rank, candidates: [Number(ranking)] };
    });
  }

  const ballots = ballotLines.map(line => {
    const [weight, ...candidateRankings] = line
      .split(" ")
      .map(chars => chars.trim());

    const ballot = {
      weight: Number(weight),
      rankings: processRankings(
        candidateRankings.slice(0, candidateRankings.length - 1)
      ),
    };

    return ballot;
  });

  return {
    withdrawnCandidates,
    numberOfCandidates,
    numberOfSeats,
    electionName,
    ballots,
    candidates,
  };
}


function doScottishSTVCount({  }) {

}


const elemBltTextarea = document.querySelector(".blt-textarea");
const elemParserResults = document.querySelector(".blt-parser-results");
const elemParserError = document.querySelector(".blt-parser-error");

elemBltTextarea.addEventListener("input", onInput);

onInput();

function clearElement(elem) {
  while (elem.lastChild) {
    elem.removeChild(elem.lastChild);
  }
}

function onInput() {
  clearElement(elemParserError);
  clearElement(elemParserResults);
  try {
    if (elemBltTextarea.value.trim().length === 0) {
      return;
    }
    const result = parse(elemBltTextarea.value);
    const elemPre = document.createElement("pre");
    elemPre.textContent = JSON.stringify(result, null, 2);
    elemParserResults.appendChild(elemPre);
  } catch (error) {
    console.error(error)
    elemParserError.textContent = "Oops! There was an error. Make sure your BLT text is properly formatted. If it is...sry ????"
  }
}


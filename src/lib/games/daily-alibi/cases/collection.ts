import type { CuratedAlibiCase } from "../types";

type Person = [name: string, roleAndMotive: string, statement: string];
type Story = {
  id: string;
  title: string;
  incident: string;
  mechanism: string;
  people: [Person, Person, Person, Person];
  culprit: number;
  clues: string[];
  deduction: string;
  exclusions: [string, string, string];
};
// This builder supplies presentation fields, not generated plots or deductions.
function build(s: Story): CuratedAlibiCase {
  let innocent = 0;
  return {
    caseId: s.id,
    title: s.title,
    dek: s.incident,
    briefTitle: s.title,
    brief: `${s.incident} Investigators established that exactly one of these four people acted alone. The listed recordings and measurements are authentic; there were no other visitors, remote controls, or hidden passages.`,
    objective:
      "Identify the one suspect whose account cannot fit the evidence of the act.",
    clues: s.clues,
    clueIds: s.clues.map((_, i) => `${s.id}-clue-${i + 1}`),
    suspects: s.people.map(([name, role, statement], i) => ({
      key: `${s.id}-${i + 1}`,
      initial: name[0],
      name,
      role,
      statement,
      correct: i === s.culprit,
      explanation:
        i === s.culprit
          ? s.deduction
          : `${s.exclusions[innocent++]} ${s.deduction}`,
    })),
    review: {
      mechanism: s.mechanism,
      deduction: s.deduction,
      exclusions: s.exclusions,
    },
  };
}
const stories: Story[] = [
  {
    id: "gallery-blue-hour",
    title: "The Blue Hour Frame",
    mechanism: "wet transfer",
    incident:
      "A loaned painting was slashed inside the gallery's framing room between 8:10 and 8:14 PM.",
    people: [
      [
        "Mara Vale",
        "CURATOR — facing an insurance audit",
        "I only handled dry frames, never the blue trolley.",
      ],
      [
        "Jon Bell",
        "LENDER — demanding the painting back",
        "I stayed on the reception video call.",
      ],
      [
        "Inez Park",
        "FRAMER — wages unpaid",
        "I stayed in the glass cutting booth.",
      ],
      [
        "Theo Reed",
        "ASSISTANT — denied promotion",
        "I unloaded crates in the yard.",
      ],
    ],
    culprit: 0,
    clues: [
      "The continuous camera shows Jon in reception, Inez in the sealed booth and Theo in the yard throughout 8:10–8:14; none could reach the framing room.",
      "Wet blue trolley paint lies inside the canvas cut, proving the blade crossed wet paint while making the slash.",
      "Only the framing trolley had wet blue paint that evening, and Mara alone entered the inspected-empty framing room during the damage window.",
      "At 8:14 Mara's glove carried a fresh blue gripping mark; continuous footage shows her keeping that glove on since 8:10.",
    ],
    deduction:
      "The three continuous alibis exclude Jon, Inez and Theo. Mara alone entered the room during the slash, and the wet trolley paint inside the cut matches her fresh glove mark. Her dry-frames account fails against both access and transfer evidence.",
    exclusions: [
      "Jon is continuously recorded in reception during the entire damage window.",
      "Inez is continuously recorded inside the sealed cutting booth during the damage window.",
      "Theo is continuously recorded in the yard and cannot reach the framing room in that interval.",
    ],
  },
  {
    id: "hotel-eleven-minutes",
    title: "Eleven Minutes at the Hotel",
    mechanism: "travel time",
    incident:
      "A guest's sealed contract was burned in the hotel service furnace at 10:06 PM.",
    people: [
      [
        "Rosa Minh",
        "MANAGER — threatened with dismissal",
        "I reached the roof at 10:05.",
      ],
      [
        "Cal Price",
        "CONCIERGE — named in the contract",
        "I served a guest at the street desk.",
      ],
      [
        "Nell Ortiz",
        "CHEF — losing her kitchen lease",
        "I worked at the kitchen camera.",
      ],
      [
        "Owen Fox",
        "PORTER — promised a reward",
        "I brought bags up the main stairs.",
      ],
    ],
    culprit: 3,
    clues: [
      "The furnace heat camera records one person feeding the contract at 10:06; protective clothing obscures the face.",
      "Cal and Nell appear continuously on street-desk and kitchen recordings from 10:00 to 10:10.",
      "The roof camera shows Rosa continuously from 10:05 to 10:10; the furnace is eleven minutes away with no lift connection.",
      "The main stairs were sealed for varnish from 10:00 to 10:10 and the seal stayed intact; Owen's trolley appears at the furnace at 10:07.",
    ],
    deduction:
      "Rosa cannot cover eleven minutes in the one minute before the burning. Cal and Nell are continuously elsewhere. Owen's staircase was sealed and his trolley reached the furnace; he is the only possible furnace visitor at 10:06.",
    exclusions: [
      "Rosa is recorded on the roof one minute before the act, eleven minutes from the furnace.",
      "Cal remains on continuous street-desk footage throughout the furnace event.",
      "Nell remains on continuous kitchen footage throughout the furnace event.",
    ],
  },
  {
    id: "museum-swapped-labels",
    title: "The Labels That Moved",
    mechanism: "exclusive access",
    incident:
      "Two provenance labels were swapped inside a museum display at 3:20 PM to disguise a forgery.",
    people: [
      [
        "Ada Lin",
        "DONOR — protecting her family reputation",
        "My guest pass cannot open the case.",
      ],
      [
        "Ben Holt",
        "REGISTRAR — approved the disputed purchase",
        "I never opened that case today.",
      ],
      [
        "Cleo Ross",
        "GUIDE — facing redundancy",
        "I stayed with the school group.",
      ],
      [
        "Dev Shah",
        "RESTORER — blamed for the forgery",
        "My key was sealed for inspection.",
      ],
    ],
    culprit: 1,
    clues: [
      "Exhibit scans show correct labels at 3:19 and swapped labels at 3:21; the locked front door is the only access.",
      "The door logs one opening at 3:20, requiring Ben's live fingerprint and his individually assigned key together.",
      "Keys remained visibly with their owners; there was no override, delegated biometric access or other door opening.",
      "Ada's pass is read-only, Cleo remains continuously filmed with the group, and Dev's key stays under an intact inspection seal until 4:00.",
    ],
    deduction:
      "The only opening between the scans used Ben's own live fingerprint and key. His denial conflicts with direct access evidence. Ada cannot open the case, Cleo is continuously elsewhere and Dev's key is sealed, so Ben swapped the labels.",
    exclusions: [
      "Ada's read-only pass cannot open the only route to the labels.",
      "Cleo is continuously filmed with the school group while the labels change.",
      "Dev's case key remains sealed and the door records Ben's live fingerprint instead.",
    ],
  },
  {
    id: "theater-silent-cue",
    title: "The Silent Cue",
    mechanism: "recorded alibi",
    incident:
      "A stage safety cable was cut during the theater's 7:40–7:42 sound test, closing the premiere.",
    people: [
      [
        "Emil Shaw",
        "ACTOR — disputing his contract",
        "I sang the test phrase on stage.",
      ],
      [
        "Faye Cole",
        "SOUND OPERATOR — overtime unpaid",
        "I read the cue numbers at the desk.",
      ],
      [
        "Gus Lane",
        "STAGEHAND — facing replacement",
        "You can hear me counting beside the others.",
      ],
      [
        "Hope Quinn",
        "DIRECTOR — facing a hostile review",
        "I stayed in the auditorium feed.",
      ],
    ],
    culprit: 2,
    clues: [
      "The safety monitor records the cable intact at 7:40 and severed at 7:42; cutting it requires entering the isolated fly loft.",
      "Continuous video shows Emil on stage, Faye at the sound desk and Hope in the auditorium during those two minutes.",
      "Each filmed location is at least four minutes from the loft; the sound desk has no means of operating a cutting tool there.",
      "Gus's counting repeats an identical dropped-spanner waveform; the input log confirms his channel was a recording rather than a live microphone.",
    ],
    deduction:
      "Emil, Faye and Hope cannot leave their continuous video alibis and reach the loft within the cutting window. Gus's supposedly live voice was a repeated recording, leaving him as the only person able to cut the cable.",
    exclusions: [
      "Emil is continuously visible on stage, four minutes from the loft, throughout the two-minute window.",
      "Faye is continuously visible at the sound desk throughout the two-minute window.",
      "Hope is continuously visible in the auditorium throughout the monitored cutting interval.",
    ],
  },
  {
    id: "station-platform-clock",
    title: "The Platform Clock",
    mechanism: "clock offset",
    incident:
      "A signal lever was deliberately locked at 6:12 PM, stranding a train carrying valuable cargo.",
    people: [
      [
        "Ivo Grant",
        "DISPATCHER — under investigation",
        "The platform clock said 6:05 when I left the cabin.",
      ],
      [
        "June West",
        "DRIVER — denied promotion",
        "I was inside the moving train cab.",
      ],
      [
        "Kian Wu",
        "PORTER — cargo fees unpaid",
        "I stayed at the east loading dock.",
      ],
      [
        "Luz Mora",
        "INSPECTOR — disputing the permit",
        "I remained in the public queue.",
      ],
    ],
    culprit: 0,
    clues: [
      "The synchronized tamper sensor records the lever being locked manually inside the cabin at 6:12 PM control time.",
      "After repair that afternoon, the platform clock ran steadily seven minutes behind control time until 7:00 PM.",
      "The cabin camera records Ivo leaving as the platform clock reads 6:05, after he spent five minutes alone inside the inspected-empty cabin.",
      "Continuous synchronized footage shows June in the moving cab, Kian on the east dock and Luz in the queue from 6:10 to 6:15.",
    ],
    deduction:
      "Platform 6:05 means actual 6:12, so Ivo's departure coincides with the manual locking after his sole cabin visit. June, Kian and Luz have continuous synchronized alibis. The slow clock cannot establish Ivo's earlier departure; he locked the lever.",
    exclusions: [
      "June is continuously recorded in the moving train cab at the synchronized event time.",
      "Kian is continuously recorded on the east dock at 6:12 control time.",
      "Luz is continuously recorded in the public queue at 6:12 control time.",
    ],
  },
  {
    id: "restaurant-salt-service",
    title: "Salt Before Service",
    mechanism: "ingredient accounting",
    incident:
      "Competition stock was ruined with salt in a restaurant between 4:00 and 4:03 PM.",
    people: [
      [
        "Mina Ford",
        "SOUS-CHEF — denied the head role",
        "I used sugar from the white jar in pastry.",
      ],
      [
        "Noah Kim",
        "OWNER — seeking an insurance payout",
        "I stayed on the glass-office video call.",
      ],
      [
        "Orla Reed",
        "PASTRY CHEF — losing her menu slot",
        "My sugar jar never left my bench.",
      ],
      [
        "Paz Bell",
        "SUPPLIER — invoices unpaid",
        "I stayed at the loading camera.",
      ],
    ],
    culprit: 0,
    clues: [
      "A sealed stock sample at 4:00 is unsalted; the 4:03 sample contains exactly 200 grams of added salt.",
      "The only salt supply is a blue jar on a calibrated scale; its weight falls by 200 grams at 4:02 under a briefly obscured camera.",
      "Orla and her white sugar jar are continuously visible on pastry footage from 4:00 to 4:03; neither leaves the separate room.",
      "Noah and Paz are continuously filmed in the locked office and loading bay; Mina alone enters the inspected-empty stock room carrying the blue jar at 4:01.",
    ],
    deduction:
      "The added salt matches the blue jar's measured loss, not sugar from Orla's stationary white jar. Noah, Orla and Paz have continuous alibis. Mina alone carries the blue jar into the stock room, contradicting her pastry account and identifying the saboteur.",
    exclusions: [
      "Noah is continuously visible in the locked office during the contamination.",
      "Orla and her sugar jar are continuously visible in the separate pastry room.",
      "Paz is continuously recorded in the loading bay during the contamination window.",
    ],
  },
  {
    id: "laboratory-dark-freezer",
    title: "The Dark Freezer",
    mechanism: "physical versus remote control",
    incident:
      "A laboratory freezer was unplugged at 1:16 PM, destroying a disputed culture.",
    people: [
      [
        "Rin Hall",
        "INVESTIGATOR — grant in jeopardy",
        "I attended the streamed ethics hearing.",
      ],
      [
        "Sol Diaz",
        "TECHNICIAN — blamed for contamination",
        "I only changed the temperature remotely.",
      ],
      [
        "Tess Yang",
        "PARTNER — seeking the patent",
        "I stayed at the courtyard interview.",
      ],
      [
        "Umar Lake",
        "AUDITOR — his report challenged",
        "I stayed in the recorded security office.",
      ],
    ],
    culprit: 1,
    clues: [
      "The electrical logger records the wall plug physically removed at 1:16; the remote thermostat cannot interrupt mains power.",
      "Continuous corridor footage shows Sol entering the freezer room at 1:15 and leaving at 1:17 with no other entrant.",
      "An inspection at 1:14 found the room empty with the freezer working; there is no internal hiding place.",
      "Rin, Tess and Umar are continuously filmed in the hearing, courtyard interview and security office from 1:10 to 1:20.",
    ],
    deduction:
      "The failure requires physical unplugging rather than Sol's remote setting. The room is empty until his sole visit, while Rin, Tess and Umar are continuously recorded elsewhere. Sol alone could remove the plug at 1:16.",
    exclusions: [
      "Rin's continuous hearing footage covers the entire physical unplugging interval.",
      "Tess's continuous courtyard interview covers the entire freezer-room visit.",
      "Umar is continuously recorded in the security office while the plug is removed.",
    ],
  },
  {
    id: "mansion-wet-library",
    title: "Rain in the Library",
    mechanism: "weather sequence",
    incident:
      "A disputed will was soaked through the mansion library's skylight at 11:22 AM.",
    people: [
      [
        "Vera Moss",
        "HEIR — excluded from the will",
        "I remained on the solicitor's call.",
      ],
      [
        "Will Nash",
        "GARDENER — facing eviction",
        "I stayed at the gate intercom.",
      ],
      [
        "Xena Orr",
        "EXECUTOR — criticized in the will",
        "The skylight was already open when I entered at 11:21.",
      ],
      [
        "Yuri Penn",
        "ARCHIVIST — blamed for missing papers",
        "I remained in the cataloguing booth.",
      ],
    ],
    culprit: 2,
    clues: [
      "The skylight contact sensor records it shut until 11:22 and then opened with its manual crank inside the library.",
      "Heavy rain begins at 11:22; the desk camera shows the will dry beneath the skylight at 11:21 and wet at 11:23.",
      "After an empty-room inspection at 11:20, continuous doorway footage shows Xena as the sole library visitor until 11:24.",
      "Vera's video call, Will's gate intercom and Yuri's booth camera show them continuously elsewhere from 11:20 to 11:24.",
    ],
    deduction:
      "The sensor disproves Xena's already-open claim at 11:21. She alone occupies the library when the inside crank opens the skylight at 11:22, just as rain starts. All three others have continuous alibis, so Xena soaked the will.",
    exclusions: [
      "Vera is continuously visible on the solicitor's call while the skylight opens.",
      "Will is continuously visible on the gate intercom during the skylight opening.",
      "Yuri's continuous booth footage excludes a library visit at 11:22.",
    ],
  },
  {
    id: "office-second-print",
    title: "The Second Print",
    mechanism: "printer provenance",
    incident:
      "A forged approval replaced the original in an office tray at 5:30 PM.",
    people: [
      [
        "Anya Cole",
        "DIRECTOR — facing a board vote",
        "I signed only the original this morning.",
      ],
      [
        "Bram Lee",
        "ANALYST — losing his project",
        "I was presenting in the glass meeting room.",
      ],
      ["Cora Dean", "ASSISTANT — denied a pay rise", "I stayed at reception."],
      [
        "Dara Finn",
        "FINANCE LEAD — concealed a shortfall",
        "That sheet came from the shared printer, not mine.",
      ],
    ],
    culprit: 3,
    clues: [
      "The tray camera records an original removed and a replacement inserted at 5:30; the person's face is obscured.",
      "The replacement carries Dara's printer's unique repeating roller defect; a shared-printer test lacks the defect.",
      "The original stayed sealed in the tray until 5:29, and Dara's local printer logs a page at 5:29 with nobody borrowing it on corridor footage.",
      "Anya, Bram and Cora are continuously filmed on a board call, presenting and at reception from 5:28 to 5:32.",
    ],
    deduction:
      "The replacement originates at Dara's printer just before the fixed swap time, contrary to her shared-printer claim. Nobody borrows it, and Anya, Bram and Cora are continuously elsewhere. Dara produced and inserted the forged approval.",
    exclusions: [
      "Anya is continuously recorded on the board call during the tray swap.",
      "Bram remains on continuous meeting-room footage throughout the swap window.",
      "Cora is continuously recorded at reception while the original is replaced.",
    ],
  },
  {
    id: "venue-cut-encore",
    title: "The Cut Encore",
    mechanism: "tool geometry",
    incident:
      "An amplifier cable was severed inside a venue's locked rack at 8:44 PM.",
    people: [
      [
        "Eden Shaw",
        "PROMOTER — losing money on the show",
        "I attended the filmed ticket count.",
      ],
      [
        "Finn Grey",
        "GUITARIST — denied a solo slot",
        "I stayed on the stage livestream.",
      ],
      [
        "Gia Snow",
        "ENGINEER — dismissed after tonight",
        "My cutters never touched that rack.",
      ],
      [
        "Hale Moon",
        "MANAGER — disputing the fee",
        "I stayed with the ticket counters.",
      ],
    ],
    culprit: 2,
    clues: [
      "The rack sensor records its door opening at 8:43 and the cable severed at 8:44; ventilation slots cannot admit a tool to the cable.",
      "The cut bears a triangular ridge matching Gia's chipped cutter jaw, reproduced in a supervised comparison test.",
      "Tools stay on their owners' belts on corridor footage, and Gia alone enters the inspected-empty rack room from 8:43 to 8:45.",
      "Eden and Hale remain continuously filmed at the ticket count and Finn on the stage livestream from 8:40 to 8:48.",
    ],
    deduction:
      "The cut occurs during Gia's sole rack visit and bears her cutters' distinctive chipped-jaw mark. The footage rules out a borrowed tool and gives the other three continuous alibis. Gia's untouched-rack account fails; she severed the cable.",
    exclusions: [
      "Eden is continuously visible in the ticket-count recording at the break time.",
      "Finn is continuously visible on the stage livestream while the rack is opened.",
      "Hale is continuously recorded with the ticket counters during the cable break.",
    ],
  },
  {
    id: "auction-withdrawn-lot",
    title: "The Withdrawn Lot",
    mechanism: "sealed custody",
    incident:
      "A forged withdrawal order appeared in an auctioneer's dispatch pouch between 11:59 AM and 12:02 PM.",
    people: [
      [
        "Isla King",
        "SELLER — regretting the reserve",
        "I carried the pouch but never opened it.",
      ],
      [
        "Joss Ray",
        "BIDDER — priced out of the sale",
        "I waited in the bidding booth.",
      ],
      [
        "Keira Lowe",
        "VALUER — appraisal challenged",
        "I stayed on the valuation livestream.",
      ],
      [
        "Leon Voss",
        "CLERK — threatened with dismissal",
        "I stayed at the receipt camera.",
      ],
    ],
    culprit: 0,
    clues: [
      "At 11:59 the pouch is inspected empty and sealed; its local sensor detects opening at noon and resealing at 12:01.",
      "Continuous corridor video shows the pouch in Isla's hands from inspection to delivery, with nobody approaching her.",
      "At 12:02 the order is found inside the same pouch; no slit, alternate opening or replacement seal exists.",
      "Joss's booth, Keira's valuation feed and Leon's receipt camera show them continuously away from Isla throughout the custody interval.",
    ],
    deduction:
      "The pouch is empty before Isla takes uninterrupted sole custody and contains the forgery immediately afterward. It opens only during her custody, contradicting her denial. No other suspect approaches, so Isla inserts the order.",
    exclusions: [
      "Joss never approaches the pouch and remains continuously in the bidding booth.",
      "Keira remains continuously on the valuation feed while Isla carries the pouch.",
      "Leon remains continuously at the receipt camera while the pouch opens.",
    ],
  },
  {
    id: "library-erased-margin",
    title: "The Erased Margin",
    mechanism: "restricted document access",
    incident:
      "A donor's restriction was erased from a library deed between its 2:00 scan and 2:05 inspection.",
    people: [
      [
        "Mae Park",
        "TRUSTEE — wanted to sell the annex",
        "My reader key cannot unlock original deeds.",
      ],
      [
        "Nico Lane",
        "CATALOGUER — facing discipline",
        "I never opened the deed sleeve.",
      ],
      [
        "Opal Reed",
        "DONOR — feuding with trustees",
        "I returned my access key yesterday.",
      ],
      [
        "Perry Moss",
        "SOLICITOR — paid if the sale closed",
        "My cabinet key was held by the inspector.",
      ],
    ],
    culprit: 1,
    clues: [
      "The 2:00 scan shows the original restriction; the 2:05 inspection finds fresh eraser crumbs, with no document substitution.",
      "The sleeve opens only at 2:03 using Nico's live fingerprint and mechanical key; its rear seal is intact.",
      "Mae's reader key cannot open sleeves; Opal's surrendered key stays sealed at reception through 3:00.",
      "Perry's cabinet key remains under the inspector's continuous custody, and no duplicate or emergency sleeve key exists.",
    ],
    deduction:
      "The erasure occurs between the scans and requires the sleeve's sole opening. Nico's live fingerprint and key authenticate that opening, contrary to his denial. Mae has no suitable key, Opal surrendered hers and Perry's is continuously held by the inspector.",
    exclusions: [
      "Mae's reader key cannot open the sleeve containing the original deed.",
      "Opal's surrendered key remains sealed at reception throughout the erasure window.",
      "Perry's key remains with the inspector and there is no alternate sleeve access.",
    ],
  },
  {
    id: "ship-closed-valve",
    title: "The Closed Valve",
    mechanism: "route elimination",
    incident:
      "A cruise ship's freshwater branch was manually closed at 9:32 AM, flooding a maintenance tank.",
    people: [
      [
        "Quinn Vega",
        "ENGINEER — blamed for repair costs",
        "I entered the engine deck at 9:31.",
      ],
      [
        "Rae North",
        "PURSER — hid an overspend",
        "I was at the cash desk at 9:30.",
      ],
      [
        "Sami Dale",
        "PLUMBER — losing his contract",
        "I inspected the valve but left it open.",
      ],
      [
        "Tori Wells",
        "OFFICER — criticized in a report",
        "I was mustering on the upper deck at 9:31.",
      ],
    ],
    culprit: 2,
    clues: [
      "A tested position monitor records the hand valve moving from open to closed at 9:32; it has no automatic or remote actuator.",
      "Quinn's witnessed engine-deck entry is at 9:31, and the only route from there to the valve takes six minutes.",
      "Rae signs a cash count at 9:30 seven minutes from the valve, while Tori is witnessed on the upper deck at 9:31 four minutes away.",
      "The inspected-empty valve-room entry log shows Sami visiting from 9:31 to 9:34; there is no alternate entrance or earlier occupant.",
    ],
    deduction:
      "Quinn, Rae and Tori cannot cover their verified journey times before 9:32. Sami is alone in the valve room when the manual position changes. His left-open claim conflicts with the tested monitor, identifying Sami as the person who closed it.",
    exclusions: [
      "Quinn needs six minutes after 9:31 to reach the valve, missing the 9:32 event.",
      "Rae needs seven minutes after the witnessed 9:30 cash count to reach the valve.",
      "Tori needs four minutes after the witnessed 9:31 muster to reach the valve.",
    ],
  },
  {
    id: "film-reversed-reel",
    title: "The Reversed Reel",
    mechanism: "offline console authentication",
    incident:
      "A film set's sole master take was overwritten at 6:18 PM before delivery to its backers.",
    people: [
      [
        "Uma Bell",
        "PRODUCER — funding in dispute",
        "My access is network-only.",
      ],
      [
        "Vik Rao",
        "ACTOR — disliked the take",
        "My card only opens the makeup room.",
      ],
      [
        "Wren Fox",
        "DIRECTOR — wanted a reshoot",
        "My console credential expired at six.",
      ],
      [
        "Xavi Hart",
        "EDITOR — dismissed after delivery",
        "The overwrite came from the network.",
      ],
    ],
    culprit: 3,
    clues: [
      "The audit records an overwrite locally approved at 6:18; the server's network cable remains unplugged under an intact seal from 6:00 to 6:30.",
      "Local approval requires a live palm scan and the audit records Xavi's palm at 6:18; no stored biometric replay is accepted.",
      "Uma's permission is network-only, Vik's card opens only makeup, and Wren's console access expired at 6:00 without renewal.",
      "The master is intact on the 6:17 check and overwritten on the 6:19 check; no earlier edit or delayed automatic job exists.",
    ],
    deduction:
      "The sealed network disconnection rules out Xavi's network explanation. The local live-palm approval identifies him during the fixed overwrite window. The other suspects have no enabled route to approve that operation, so Xavi destroys the master.",
    exclusions: [
      "Uma's network-only access cannot operate through the sealed disconnected cable.",
      "Vik's makeup-room card has no console permissions and cannot approve an overwrite.",
      "Wren's credential expired before the overwrite and was not renewed.",
    ],
  },
  {
    id: "garden-warm-orchids",
    title: "The Warm Orchids",
    mechanism: "temperature sequence",
    incident:
      "The botanical garden's cold-room orchids were deliberately heated at 5:08 AM before judging.",
    people: [
      [
        "Yara Stone",
        "HORTICULTURIST — denied an award",
        "The heater was already on when I entered.",
      ],
      [
        "Zed Cole",
        "SPONSOR — backing a rival collection",
        "I stayed on the breakfast broadcast.",
      ],
      [
        "Alma Ruiz",
        "KEEPER — warned over her care log",
        "I stayed at the gate camera.",
      ],
      [
        "Basil Ng",
        "JUDGE — favoritism alleged",
        "I stayed on the filmed inspection tour.",
      ],
    ],
    culprit: 0,
    clues: [
      "The heater log switches from off to manual high at 5:08; the switch is inside and all automatic schedules were disabled.",
      "After an empty-room inspection at 5:05, doorway footage shows only Yara entering the inner cold room from 5:07 to 5:10.",
      "The temperature trace starts rising at 5:08, matching the manual-switch event rather than an earlier heater fault.",
      "Zed, Alma and Basil remain continuously visible on broadcast, gate and tour recordings from 5:05 to 5:12.",
    ],
    deduction:
      "The heater was off before Yara entered, then changed manually during her sole inner-room visit. The temperature trace corroborates the switch and contradicts her already-on claim. The other three have continuous alibis, identifying Yara.",
    exclusions: [
      "Zed is continuously visible on the breakfast broadcast during the heater change.",
      "Alma is continuously visible at the gate throughout the cold-room visit.",
      "Basil is continuously visible on the filmed tour while the heater changes.",
    ],
  },
  {
    id: "bakery-last-proof",
    title: "The Last Proof",
    mechanism: "display semantics",
    incident:
      "Competition dough was destroyed by a manual cabinet temperature increase at 3:14 AM.",
    people: [
      [
        "Celia Park",
        "OWNER — struggling with debts",
        "I remained on the accounts call.",
      ],
      [
        "Damon Price",
        "BAKER — entering a rival contest",
        "The display said fourteen minutes; I only checked the timer.",
      ],
      [
        "Elin Frost",
        "APPRENTICE — denied qualification",
        "I stayed at the filmed delivery check.",
      ],
      [
        "Farid Lake",
        "SUPPLIER — order canceled",
        "I stayed beside the loading camera.",
      ],
    ],
    culprit: 1,
    clues: [
      "The cabinet audit logs a manual temperature change to 90 degrees at 3:14; its countdown timer was disabled all night.",
      "The display alternates clock minutes and temperature, so the '14' at 3:14 is a clock reading rather than a countdown.",
      "Only Damon touches the controls from 3:10 to 3:18 on continuous camera footage; the earlier inspection shows a normal setting.",
      "Celia, Elin and Farid remain continuously filmed on accounts, delivery and loading recordings throughout that interval.",
    ],
    deduction:
      "No timer was active for Damon to check: fourteen was clock minutes. The audit records a manual increase while he alone touches the controls. Celia, Elin and Farid have continuous alibis, so Damon destroyed the dough.",
    exclusions: [
      "Celia's continuous accounts call excludes touching the cabinet during the temperature change.",
      "Elin remains continuously visible at the delivery check while the setting changes.",
      "Farid remains continuously visible at loading throughout the cabinet change.",
    ],
  },
  {
    id: "observatory-blind-dome",
    title: "The Blind Dome",
    mechanism: "weather versus obstruction",
    incident:
      "An observatory telescope was deliberately capped during a once-only transit at 1:02 AM.",
    people: [
      [
        "Galen Reed",
        "ASTRONOMER — competing for credit",
        "I was on the public lecture feed.",
      ],
      [
        "Hana West",
        "DONOR — wanted the project canceled",
        "I was on the trustees' call.",
      ],
      [
        "Idris Cole",
        "OPERATOR — blamed for lost data",
        "Cloud covered the sky; I never touched the lens.",
      ],
      [
        "Jade Moss",
        "RESEARCHER — excluded from the paper",
        "I stayed in the instrument booth.",
      ],
    ],
    culprit: 2,
    clues: [
      "An independent sky camera records a clear transit while the telescope alone goes completely dark at 1:02.",
      "A contact sensor records the opaque cap attached by hand at 1:02; the cap has no motor or self-closing mechanism.",
      "After a 12:57 empty-dome inspection, doorway footage shows Idris as its sole occupant from 12:58 to 1:05.",
      "Galen, Hana and Jade remain continuously visible on lecture, trustee-call and instrument-booth recordings from 12:58 to 1:05.",
    ],
    deduction:
      "The independent clear sky disproves Idris's cloud account. The hand-attached cap darkens the telescope while he alone occupies the dome. The three other suspects have continuous alibis, leaving Idris as the saboteur.",
    exclusions: [
      "Galen remains continuously visible on the public lecture feed while the cap is attached.",
      "Hana remains continuously visible on the trustees' call during the transit.",
      "Jade remains continuously visible in the instrument booth during the capping.",
    ],
  },
  {
    id: "radio-dead-air",
    title: "Ninety Seconds of Silence",
    mechanism: "source routing",
    incident:
      "A radio appeal was replaced with silence at the transmitter at 4:45 PM.",
    people: [
      [
        "Kora Dean",
        "PRESENTER — opposed the appeal",
        "I read the appeal live in the booth.",
      ],
      [
        "Liam Fox",
        "PRODUCER — losing a sponsor",
        "I remained at the planning meeting.",
      ],
      [
        "Mira Snow",
        "GUEST — objected to the cause",
        "I stayed beside the booth camera.",
      ],
      [
        "Nabil Shore",
        "ENGINEER — blamed for neglect",
        "The incoming feed failed; I never changed the routing.",
      ],
    ],
    culprit: 3,
    clues: [
      "Both the booth recorder and the incoming-feed monitor contain uninterrupted clean appeal audio throughout the silence.",
      "The transmitter log switches to an unused silent input at 4:45 through the mechanical patch bay, which has no remote actuator.",
      "Patch-room footage shows Nabil alone from 4:43 to 4:48, moving a patch lead at 4:45; the room was empty before his arrival.",
      "Kora and Mira remain continuously visible in the booth and Liam at the planning meeting from 4:43 to 4:48.",
    ],
    deduction:
      "Both source recordings are intact, so the silence comes from routing rather than feed failure. Nabil alone moves the physical patch lead at the logged time. The others' continuous alibis exclude them, identifying Nabil.",
    exclusions: [
      "Kora remains continuously visible in the booth reading the uninterrupted appeal.",
      "Liam remains continuously visible at the planning meeting throughout the routing change.",
      "Mira remains continuously visible beside the booth camera during the outage.",
    ],
  },
  {
    id: "bank-carbon-copy",
    title: "The Carbon Copy",
    mechanism: "pressure impression",
    incident:
      "A bank transfer instruction was changed from 80 to 800 at 2:32 PM.",
    people: [
      [
        "Ona Grey",
        "TREASURER — covering a shortfall",
        "I handled only the blue receipt, never the transfer.",
      ],
      [
        "Pavel Lin",
        "TELLER — facing dismissal",
        "I stayed in the customer interview.",
      ],
      [
        "Rhea Holt",
        "ACCOUNTANT — disputing the account",
        "I stayed in the audit booth.",
      ],
      [
        "Seth Quinn",
        "CLIENT — wanted the transfer stopped",
        "I remained in the waiting area.",
      ],
    ],
    culprit: 0,
    clues: [
      "A document camera shows the instruction reading 80 at 2:31 and 800 at 2:33, with no exchange of sheets.",
      "The added zero leaves a matching fresh pressure impression on the blue receipt directly below the original transfer form.",
      "The desk feed shows only Ona at the writing pad between 2:31 and 2:33; her hand briefly covers the number.",
      "Pavel, Rhea and Seth are continuously recorded in interview, audit booth and waiting area during those two minutes.",
    ],
    deduction:
      "The fresh zero impression proves writing on the original transfer while it rests on Ona's receipt. Only Ona handles that pad during the alteration; her receipt-only claim is false. The other three continuous recordings rule them out.",
    exclusions: [
      "Pavel is continuously visible at the customer interview during the alteration.",
      "Rhea is continuously visible in the audit booth while the zero is added.",
      "Seth is continuously visible in the waiting area throughout the alteration window.",
    ],
  },
  {
    id: "ice-rink-thaw",
    title: "A Thaw Before Finals",
    mechanism: "mechanical interlock",
    incident:
      "A rink's cooling pump was deliberately stopped at 7:09 AM, canceling the final.",
    people: [
      [
        "Talia King",
        "COACH — her skater injured",
        "I stayed at the team briefing.",
      ],
      [
        "Ugo Reed",
        "MECHANIC — repair bill unpaid",
        "The pump tripped automatically; I never pulled the lever.",
      ],
      [
        "Vina Hart",
        "ORGANIZER — cancellation insurance",
        "I stayed on the sponsor call.",
      ],
      [
        "Walt Park",
        "JUDGE — assignment disputed",
        "I stayed at the equipment check.",
      ],
    ],
    culprit: 1,
    clues: [
      "The fault log contains no trip and voltage stays normal; the mechanical stop lever is latched down at 7:09.",
      "The tested latch engages only when its lever is pulled by hand; power failure and automatic protection cannot latch it.",
      "Entrance footage shows only Ugo entering the inspected-empty pump room from 7:08 to 7:11.",
      "Talia, Vina and Walt are continuously visible at the filmed briefing, sponsor call and equipment check from 7:07 to 7:12.",
    ],
    deduction:
      "The manually latched lever and clean fault log disprove Ugo's automatic-trip claim. The latch moves during his sole room visit. The three other suspects have continuous alibis, so Ugo stopped the pump by hand.",
    exclusions: [
      "Talia is continuously filmed at the team briefing during the lever movement.",
      "Vina is continuously visible on the sponsor call throughout the pump-room visit.",
      "Walt is continuously filmed at the equipment check during the lever movement.",
    ],
  },
  {
    id: "courthouse-missing-seal",
    title: "The Broken Evidence Seal",
    mechanism: "custody chronology",
    incident:
      "A note disappeared from a sealed evidence bag between 12:13 and 12:15 PM before a hearing.",
    people: [
      [
        "Ari Lowe",
        "CLERK — blamed for a filing error",
        "I packed the bag before collection.",
      ],
      [
        "Bea Nash",
        "LAWYER — note weakened her case",
        "I handled the bag only after delivery.",
      ],
      [
        "Cai Penn",
        "COURIER — paid to delay delivery",
        "It was already open when I collected it.",
      ],
      [
        "Dina Ray",
        "WITNESS — note contradicted her",
        "I last handled it at noon.",
      ],
    ],
    culprit: 2,
    clues: [
      "At 12:13 the collection camera shows the note inside the sealed numbered bag as Cai takes it from Ari.",
      "The seal sensor records tearing at 12:14, and the 12:15 delivery camera shows the same bag empty with fresh tears.",
      "A corridor camera follows Cai alone throughout the journey, with no handoff, approach, concealment or bag exchange.",
      "Bea first touches the already-empty bag after the recorded delivery; Dina's noon visit precedes the verified intact collection.",
    ],
    deduction:
      "The note is present at Cai's collection and gone before Bea's first handling. The seal tears during Cai's uninterrupted sole custody, contradicting his already-open claim. Ari's packing and Dina's earlier visit precede the verified intact state, so Cai removed it.",
    exclusions: [
      "Ari hands over a visibly intact bag still containing the note, before its disappearance.",
      "Bea first handles the bag after the delivery camera has already recorded it empty.",
      "Dina's noon handling precedes the verified intact state at 12:13.",
    ],
  },
  {
    id: "aquarium-low-oxygen",
    title: "The Silent Aerator",
    mechanism: "airflow accounting",
    incident:
      "An aquarium's quarantine air supply was diverted at 10:24 AM, endangering rare fish.",
    people: [
      [
        "Eli West",
        "CURATOR — under budget pressure",
        "I stayed on the school tour.",
      ],
      [
        "Fia Moss",
        "VET — disputed quarantine",
        "I stayed on the consultation feed.",
      ],
      [
        "Gabe Moon",
        "SPONSOR — wanted another exhibit",
        "I stayed in the donor lounge.",
      ],
      [
        "Hira Vale",
        "TECHNICIAN — blamed for an earlier loss",
        "The pump failed while I inspected the manifold.",
      ],
    ],
    culprit: 3,
    clues: [
      "Pump power and pressure remain normal; only the quarantine branch loses airflow at 10:24.",
      "The manifold camera records its hand selector turned from quarantine to waste at 10:24; no automatic actuator exists.",
      "Hira alone visits the inspected-empty manifold enclosure from 10:22 to 10:26 on continuous doorway footage.",
      "Eli, Fia and Gabe remain continuously filmed on tour, consultation and lounge feeds throughout the enclosure visit.",
    ],
    deduction:
      "The operating pump disproves Hira's failure account. Air is physically diverted by the manual selector during her sole visit. Eli, Fia and Gabe have continuous alibis, so Hira is the only possible person to turn the selector.",
    exclusions: [
      "Eli remains continuously filmed on the school tour while airflow is diverted.",
      "Fia remains continuously visible on the consultation feed during the manifold visit.",
      "Gabe remains continuously visible in the donor lounge during the selector movement.",
    ],
  },
  {
    id: "newspaper-late-edition",
    title: "The Late Edition",
    mechanism: "revision provenance",
    incident:
      "A correction disappeared from a newspaper's final printing plate at 11:48 PM.",
    people: [
      [
        "Iris Lane",
        "EDITOR — correction exposed her error",
        "The press reused an old plate; I changed nothing.",
      ],
      [
        "Jalen Cole",
        "REPORTER — wanted front-page credit",
        "My file submission was at 11:40.",
      ],
      [
        "Kali Ford",
        "PRINTER — facing redundancy",
        "I fitted the approved plate at 11:50.",
      ],
      [
        "Lars Ng",
        "OWNER — feared a lawsuit",
        "I last approved a proof at eleven.",
      ],
    ],
    culprit: 0,
    clues: [
      "The proof at 11:47 includes the correction; the new plate at 11:48 omits it and its fresh serial matches the final print run.",
      "The plate's source file has exactly one change after 11:47, locally authorized at 11:48 by Iris's live fingerprint.",
      "The 11:47 proof already incorporates Jalen's 11:40 file and Lars's eleven-o'clock approval, including the correction.",
      "Kali fits the sealed new plate at 11:50 without changing its contents; the missing correction is visible before the fitting.",
    ],
    deduction:
      "The correction survives Jalen's and Lars's earlier work and is absent before Kali fits the plate. Only Iris's authenticated local revision lies between the correct proof and the new plate. Its fresh serial disproves her reused-plate explanation.",
    exclusions: [
      "Jalen's file is already included in the later 11:47 proof with its correction intact.",
      "Kali receives and fits a sealed plate whose correction is already missing.",
      "Lars's earlier approval precedes the verified corrected proof at 11:47.",
    ],
  },
  {
    id: "chess-stopped-clock",
    title: "The Stopped Clock",
    mechanism: "event semantics",
    incident:
      "A chess clock was reset at 3:07 PM during an official pause, erasing a time penalty.",
    people: [
      [
        "Mona Hart",
        "PLAYER — facing disqualification",
        "I stayed at arbitration.",
      ],
      [
        "Neri Shaw",
        "ARBITER — favoritism alleged",
        "Its battery died; I never touched it.",
      ],
      [
        "Omar Lake",
        "COACH — needed a team win",
        "I stayed on the interview feed.",
      ],
      [
        "Pia Snow",
        "SPONSOR — threatening withdrawal",
        "I stayed at the scoring desk.",
      ],
    ],
    culprit: 1,
    clues: [
      "The clock logs a two-button manual reset at 3:07; battery voltage remains normal with no power-loss event.",
      "A reset requires holding both physical buttons for five seconds; the clock has no wireless control.",
      "The tournament camera shows Neri alone beside it from 3:06 to 3:08, his hand covering the top for six seconds.",
      "Mona, Omar and Pia remain continuously filmed at arbitration, the interview and the scoring desk throughout those two minutes.",
    ],
    deduction:
      "Normal voltage and the logged manual reset rule out Neri's battery story. His six-second hand movement permits the required button hold while nobody approaches. The others have continuous alibis, identifying Neri as the person who erased the penalty.",
    exclusions: [
      "Mona remains continuously visible at arbitration during the clock reset.",
      "Omar remains continuously visible on the interview feed throughout the reset interval.",
      "Pia remains continuously visible at the scoring desk throughout the reset interval.",
    ],
  },
  {
    id: "warehouse-red-route",
    title: "The Red Route",
    mechanism: "one-way route constraint",
    incident:
      "A warehouse shipment was redirected with a manual chute switch at 8:16 AM.",
    people: [
      [
        "Remy Holt",
        "DISPATCHER — blamed for stock loss",
        "I was at dispatch at 8:15.",
      ],
      [
        "Sana Bell",
        "BUYER — wanted a discount",
        "I was collecting receipts at 8:14.",
      ],
      [
        "Tomas Grey",
        "LOADER — paid by a rival courier",
        "I took the red walkway straight to loading.",
      ],
      [
        "Una Dean",
        "AUDITOR — inventory count disputed",
        "I was in the audit booth at 8:15.",
      ],
    ],
    culprit: 2,
    clues: [
      "The chute monitor records the hand switch to the rival lane at 8:16 inside the enclosed routing cage.",
      "The red walkway ends at the cage, not loading; its exit is locked from 8:14 to 8:18. Tomas enters at 8:14, after the cage's empty inspection.",
      "Witnessed receipts place Remy and Una at their stated locations at 8:15, each at least three minutes from the cage.",
      "Sana's witnessed collection at 8:14 is five minutes from the cage; no alternate route, earlier occupant or remote switch exists.",
    ],
    deduction:
      "The red route confines Tomas to the routing cage during the switch, contradicting his loading-bay account. Remy and Una cannot cover three minutes in one, and Sana cannot cover five in two. Tomas alone can turn the chute switch at 8:16.",
    exclusions: [
      "Remy's verified 8:15 dispatch location is three minutes from the 8:16 switch.",
      "Sana's verified 8:14 collection location is five minutes from the 8:16 switch.",
      "Una's verified 8:15 audit location is three minutes from the 8:16 switch.",
    ],
  },
  {
    id: "spa-empty-reservoir",
    title: "The Empty Reservoir",
    mechanism: "water balance",
    incident:
      "A spa reservoir was drained at 6:36 AM before a licensing inspection.",
    people: [
      [
        "Vera Lin",
        "OWNER — held closure insurance",
        "I stayed on the licensing call.",
      ],
      [
        "Wes Orr",
        "THERAPIST — protesting a contract",
        "I stayed at the supply count.",
      ],
      [
        "Xia Reed",
        "INSPECTOR — favors alleged",
        "I remained in the arrival lounge.",
      ],
      [
        "Yosef Park",
        "CARETAKER — blamed for water costs",
        "It leaked away; I never opened the outlet.",
      ],
    ],
    culprit: 3,
    clues: [
      "The reservoir loses 400 liters at 6:36; the calibrated service-outlet meter records exactly 400 liters while leak detectors remain dry.",
      "The outlet can only open by turning its handwheel inside the locked service room; it cannot open from pressure or electrical failure.",
      "Continuous doorway footage shows Yosef alone in the inspected-empty room from 6:34 to 6:38.",
      "Vera, Wes and Xia are continuously filmed on the licensing call, supply count and arrival-lounge feed from 6:34 to 6:38.",
    ],
    deduction:
      "Matching outlet flow and reservoir loss exclude a leak. The manual outlet opens during Yosef's sole service-room visit, contradicting his denial. Vera, Wes and Xia have continuous alibis, so Yosef deliberately drains the reservoir.",
    exclusions: [
      "Vera remains continuously visible on the licensing call while the reservoir drains.",
      "Wes remains continuously visible at the supply count throughout the room visit.",
      "Xia remains continuously visible in the arrival lounge while the outlet opens.",
    ],
  },
  {
    id: "archive-wrong-negative",
    title: "The Wrong Negative",
    mechanism: "image orientation",
    incident:
      "An archive negative was replaced with a mirrored duplicate at 4:12 PM, hiding a maker's mark.",
    people: [
      [
        "Zara Finch",
        "DEALER — sold the disputed image",
        "The scanner flipped it; I never changed the film.",
      ],
      [
        "Arlo Moss",
        "ARCHIVIST — blamed for poor storage",
        "My handling ended at 4:00.",
      ],
      [
        "Bina Cole",
        "HEIR — wanted the image withdrawn",
        "I handled only the scan at 4:15.",
      ],
      [
        "Ciro Wells",
        "SCANNER — missed a deadline",
        "I scanned the sleeve without opening it.",
      ],
    ],
    culprit: 0,
    clues: [
      "The 4:11 light-table photo shows correct physical edge lettering; the 4:13 inspection shows reversed lettering on the film itself.",
      "A second independent light-table check confirms the physical reversal; the signed raw scanner capture preserves orientation.",
      "The only sleeve opening between checks is authenticated with Zara's live fingerprint at 4:12; the rear seal stays intact.",
      "Arlo's 4:00 handling precedes the correct 4:11 photo; Ciro's sealed scan cannot change the film, and Bina receives only a digital copy after 4:13.",
    ],
    deduction:
      "Physical reversed edge lettering disproves a scanner flip. Zara's live fingerprint opens the sleeve at the only time between correct and mirrored checks. Arlo acts before the intact state; Ciro never opens the sleeve and Bina handles only a later digital copy. Zara replaces the film.",
    exclusions: [
      "Arlo's handling ends before the later light-table photo verifies the correct negative.",
      "Bina receives only a digital copy after the physical replacement has been detected.",
      "Ciro's scan is made through the sealed sleeve and cannot replace the physical film.",
    ],
  },
  {
    id: "ferry-last-manifest",
    title: "The Last Manifest",
    mechanism: "page-count custody",
    incident:
      "A ferry manifest lost its final page between 9:01 and 9:03 AM, concealing an undeclared crate.",
    people: [
      [
        "Della King",
        "CAPTAIN — faced a customs fine",
        "I received a three-page packet at 9:03.",
      ],
      [
        "Eren Shah",
        "CLERK — signed for the crate",
        "The manifest arrived with only three pages.",
      ],
      [
        "Flora Ng",
        "CUSTOMS AGENT — search order disputed",
        "I stapled four pages at 9:01.",
      ],
      [
        "Gino Hart",
        "HAULIER — wanted immediate departure",
        "I supplied the cargo sheet before nine.",
      ],
    ],
    culprit: 1,
    clues: [
      "At 9:01 the document camera records Flora stapling four numbered pages and handing them directly to Eren.",
      "At 9:03 the delivery camera records Eren handing Della three pages, with fresh staple tears where page four was removed.",
      "Continuous corridor footage follows Eren alone between handover and delivery, with no approach, handoff or packet exchange.",
      "Gino's earlier sheet is visibly included in the complete 9:01 packet; Della's first contact follows the recorded three-page delivery.",
    ],
    deduction:
      "The four-page handover disproves Eren's three-page account. The packet loses page four during his uninterrupted sole custody. Flora delivers all four, Gino's contribution precedes that intact state, and Della receives it already incomplete. Eren removes the page.",
    exclusions: [
      "Della first touches the packet after the camera already shows it has only three pages.",
      "Flora is filmed handing over a complete four-page packet before the disappearance.",
      "Gino's earlier contribution is visibly present in the later complete packet.",
    ],
  },
  {
    id: "studio-dried-pigment",
    title: "The Dried Pigment",
    mechanism: "wet versus fired transfer",
    incident:
      "A juried vase's signature was painted over between 2:20 and 2:24 PM in a ceramic studio.",
    people: [
      [
        "Hester Ray",
        "ARTIST — competing for the prize",
        "I stayed at the portfolio interview.",
      ],
      ["Iman Fox", "CURATOR — criticized the jury", "I stayed at admissions."],
      [
        "Joel West",
        "GLAZER — denied credit",
        "The green on my sleeve came from yesterday's fired samples.",
      ],
      [
        "Kira Lake",
        "OWNER — disputing the sale",
        "I remained in the kiln-monitor booth.",
      ],
    ],
    culprit: 2,
    clues: [
      "The vase camera shows the signature intact at 2:20 and covered in wet green pigment at 2:24; the painter's face is out of frame.",
      "The wet pigment jar loses one measured brushful at 2:22; fired samples cannot transfer wet pigment under tested conditions.",
      "Joel alone enters the inspected-empty vase room from 2:21 to 2:23, leaving with a visibly wet green sleeve smear.",
      "Hester, Iman and Kira remain continuously filmed at portfolio, admissions and kiln-monitor locations throughout 2:20–2:24.",
    ],
    deduction:
      "Joel's fresh wet smear cannot come from the tested fired samples. His sole visit spans the pigment removal and overpainting, while the three others have continuous alibis. His false transfer explanation and exclusive opportunity identify Joel.",
    exclusions: [
      "Hester remains continuously visible in the portfolio interview during the overpainting.",
      "Iman remains continuously visible at admissions throughout the vase-room visit.",
      "Kira remains continuously visible in the kiln-monitor booth while pigment is applied.",
    ],
  },
  {
    id: "winery-false-vintage",
    title: "The False Vintage",
    mechanism: "cork-removal sequence",
    incident:
      "A winery reference bottle was diluted at 1:42 PM to discredit its vintage certification.",
    people: [
      [
        "Lena Grey",
        "OWNER — wanted a sale canceled",
        "I selected the reference bottle at 1:30.",
      ],
      ["Milo Penn", "TASTER — facing suspension", "I sampled it at 1:40."],
      [
        "Nora Holt",
        "BUYER — seeking a lower price",
        "I examined the diluted sample at 1:45.",
      ],
      [
        "Oren Shaw",
        "CELLARER — blamed for mislabeling",
        "I only weighed the sealed bottle.",
      ],
    ],
    culprit: 3,
    clues: [
      "Milo's 1:40 test verifies normal strength, after which a fresh tamper sensor is sealed over the cork; the 1:44 test finds dilution.",
      "The sensor records cork removal at 1:42 and replacement at 1:43; an intact-bottle weighing cannot trigger the contacts.",
      "The reference cabinet's only opening from 1:41 to 1:44 uses Oren's live fingerprint, and its rear seal remains intact.",
      "Lena's selection precedes the verified normal sample, Milo leaves before the sensor activates, and Nora first receives a sample after the 1:44 diluted test.",
    ],
    deduction:
      "The bottle is normal after Lena's handling and Milo's sample, then its cork is removed during Oren's sole authenticated access. Nora handles only a later sample. The contacts contradict Oren's weighing-only story, identifying him as the person who dilutes the wine.",
    exclusions: [
      "Lena's selection precedes the verified normal-strength sample at 1:40.",
      "Milo's test establishes the intact state before he leaves and the cork sensor activates.",
      "Nora's first handling is a later sample after the dilution has already been verified.",
    ],
  },
];
export const curatedCases = stories.map(build);

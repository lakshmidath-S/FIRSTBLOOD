// Which donor blood groups can donate TO a given recipient blood group.
// Standard ABO/Rh compatibility chart.
const COMPATIBLE_DONORS = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};

function eligibleDonorGroups(recipientGroup) {
  return COMPATIBLE_DONORS[recipientGroup] || [recipientGroup];
}

module.exports = { COMPATIBLE_DONORS, eligibleDonorGroups };

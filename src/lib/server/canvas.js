// @ts-nocheck
// TODO: remove this no check flag


/**
 * 
 * @param {string} canvas_session Active Canvas LMS session to use
 * @param {string} csrf_token The session's connected CSRF token
 * @param {string} log_session_id Canvas' log session ID
 * @returns {Headers} The header object to use in subsequent payloads
 */
export const getToken = (canvas_session, csrf_token, log_session_id) => {
  return {
    'Cookie': `log_session_id=${log_session_id};canvas_session=${canvas_session};_csrf_token=${csrf_token.indexOf('=') > -1 ? encodeURIComponent(csrf_token) : csrf_token}`,
    'X-CSRF-Token': decodeURIComponent(csrf_token),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    // MANDATORY: Canvas blocks scripts missing an identifiable User-Agent
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LMS-TODO-App'
  };
}

export const getStudentDetails = async (canvas_url, token) => {
    const res = await fetch(`https://${canvas_url}/api/v1/users/self`, {
        headers: token
    });
    return await res.json();
}

export async function fetchMyGrades(canvas_url, token, student_id) {
  const query = `
query GetStudentGradesPaginated($userId: ID!, $after: String) {
  legacyNode(type: User, _id: $userId) {
    ... on User {
      id
      name
      enrollmentsConnection(after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          state
          course {
            id
            name
          }
          grades {
            currentScore
            currentGrade
          }
        }
      }
    }
  }
}
`;

  let hasNextPage = true;
  let endCursor = null;
  const activeEnrollments = [];

  // Loop continuously until hasNextPage becomes false
  while (hasNextPage) {
    const response = await fetch(`https://${canvas_url}/api/graphql`, {
      method: 'POST',
      headers: token,
      body: JSON.stringify({ 
        query,
        variables: { 
          userId: student_id,
          after: endCursor // Key parameter: Null on first run, contains string token on subsequent runs
        }
      }),
    });

    if (!response.ok) {
      const result = await response.json();
      console.error(`HTTP Error Status: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    if (result.errors) {
      console.error('GraphQL Execution Errors:', result.errors);
      return;
    }

    const student = result.data?.legacyNode;
    if (!student) {
      console.log(`No student profile found for ID: ${student_id}`);
      return;
    }

    const connection = student.enrollmentsConnection;
    const nodes = connection?.nodes || [];

    // Filter and collect active nodes in memory from this page iteration
    nodes.forEach(enrollment => {
      if (enrollment.course && enrollment.state === 'active') {
        activeEnrollments.push(enrollment);
      }
    });

    // Update pagination variables to control loop lifecycle
    hasNextPage = connection?.pageInfo?.hasNextPage || false;
    endCursor = connection?.pageInfo?.endCursor || null;
  }

  const data = [];

  activeEnrollments.forEach(enrollment => {
    data.push({
      course: enrollment.course.name,
      grade: `${enrollment.grades?.currentGrade ?? 'N/A'}`,
      score: `${enrollment.grades?.currentScore ?? 'N/A'}`
    })
  });

  return data;
}

function getDateByDayName(rangeStart, rangeEnd, targetDayName) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const targetIndex = days.findIndex(day => day.toLowerCase() === targetDayName.toLowerCase());
  
  let current = new Date(rangeStart);
  
  while (current <= rangeEnd) {
    if (current.getDay() === targetIndex) {
      // advance the hours toward the end of the day
      current.setHours(23, 59, 59);
      return current;
    }
    current.setDate(current.getDate() + 1);
  }
  return null;
}

function extractDateRange(text) {
  // Regex to capture month, start day, end day, and year
  const regex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s(\d{1,2})-(\d{1,2}),\s(\d{4})/;
  const match = text.match(regex);

  if (match) {
    const [_, month, startDay, endDay, year] = match;
    
    // Create native JavaScript Date objects
    const startDate = new Date(`${month} ${startDay}, ${year}`);
    const endDate = new Date(`${month} ${endDay}, ${year}`);

    const dateRange = {
      start: startDate,
      end: endDate,
      relative: function() {

      }
    };

    return (day) => getDateByDayName(startDate, endDate, day);
  }

  return () => null;
}

/**
 * 
 * @param {*} canvas_url 
 * @param {*} token 
 * @param {*} student_id 
 * @param {*} cutoff 
 * @returns {Promise<{
 * accepted:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * late:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * notrequired:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * redo:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * submitted:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * unknown:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * upcoming:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>,
 * notrequired:Array<{assignment:string,course:string,dateSubmitted:Date|null,due:Date|null,grade:Number|null,isSubmitted:Boolean}>
 * >}
 */
export async function getAllDueAssignments(canvas_url, token, student_id, cutoff = 90) {
  const coursesQuery = `
query GetAllActiveAssignmentsAndSubmissions {
  allCourses {
    id
    name
  }
}
`;

  const courseDetailsQuery = `
query GetCourseAssignmentsAndSubmissions(
  $courseId: ID!
  $studentId: [ID!]
  $assignmentsAfter: String
  $submissionsAfter: String
) {
  node(id: $courseId) {
    ... on Course {
      assignmentsConnection(first: 100, after: $assignmentsAfter) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
          dueAt
          pointsPossible
        }
      }
      submissionsConnection(studentIds: $studentId, first: 100, after: $submissionsAfter) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          assignment {
            id
          }
          submittedAt
          state
          grade
          score
          excused
        }
      }
      modulesConnection(first: 100) {
        nodes {
          id
          name
          moduleItemsConnection(first: 100) {
            nodes {
              id
              title
              content {
                ... on Assignment {
                  id
                  name
                  state
                }
                ... on Page {
                  published 
                }
                __typename
              }
            }
          }
        }
      }
    }
  }
}
`;

  const response = await fetch(`https://${canvas_url}/api/graphql`, {
    method: 'POST',
    headers: token,
    body: JSON.stringify({ 
      query: coursesQuery
    }),
  });

  if (!response.ok) {
    console.error(`HTTP Error Status: ${response.status} ${response.statusText}`);
    return;
  }

  const result = await response.json();
  if (result.errors) {
    console.error('GraphQL Execution Errors:', result.errors);
    return;
  }

  const courses = result.data?.allCourses || [];
  const now = new Date();

  const data = {
    accepted: [],
    submitted: [],
    redo: [],
    late: [],
    due: [],
    upcoming: [],
    unknown: [],
    notrequired: []
  };

  for (const course of courses) {
    const assignments = [];
    const submissions = [];
    const modules = [];
    let assignmentsAfter = null;
    let submissionsAfter = null;
    let modulesAfter = null;
    let hasNextAssignmentsPage = true;
    let hasNextSubmissionsPage = true;
    let hasNextModulesPage = true;

    while (hasNextAssignmentsPage || hasNextSubmissionsPage || hasNextModulesPage) {
      const courseResponse = await fetch(`https://${canvas_url}/api/graphql`, {
        method: 'POST',
        headers: token,
        body: JSON.stringify({
          query: courseDetailsQuery,
          variables: {
            courseId: course.id,
            studentId: [student_id],
            assignmentsAfter,
            submissionsAfter,
            modulesAfter
          },
        }),
      });

      if (!courseResponse.ok) {
        console.error(`HTTP Error Status: ${courseResponse.status} ${courseResponse.statusText}`);
        return;
      }

      const courseResult = await courseResponse.json();
      if (courseResult.errors) {
        console.error('GraphQL Execution Errors:', courseResult.errors);
        return;
      }

      const courseData = courseResult.data?.node;
      if (!courseData) {
        console.error(`No course found for ID: ${course.id}`);
        return;
      }

      const assignmentsConnection = courseData.assignmentsConnection;
      const submissionsConnection = courseData.submissionsConnection;
      const modulesConnection = courseData.modulesConnection;
      assignments.push(...(assignmentsConnection?.nodes || []));
      submissions.push(...(submissionsConnection?.nodes || []));
      modules.push(...(modulesConnection?.nodes || []));

      hasNextAssignmentsPage = assignmentsConnection?.pageInfo?.hasNextPage || false;
      assignmentsAfter = assignmentsConnection?.pageInfo?.endCursor || null;
      hasNextSubmissionsPage = submissionsConnection?.pageInfo?.hasNextPage || false;
      submissionsAfter = submissionsConnection?.pageInfo?.endCursor || null;
      hasNextModulesPage = modulesConnection?.pageInfo?.hasNextPage || false;
      modulesAfter = modulesConnection?.pageInfo?.endCursor || null;
    }

    // extract due dates from modules
    const dueDateLookup = {};
    const regex = /[A-Z][a-z]+ \d{1,2}-\d{1,2}, \d{4}/;

    modules.forEach(module => {
      const dateRangeComputer = extractDateRange(module.name);

      let currentDay = null;

      module.moduleItemsConnection?.nodes.forEach(moduleItem => {
        const regex = /\((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\)/i;
        const match = moduleItem.title.match(regex);

        if (match) currentDay = match[1];
        else if (moduleItem.content.__typename === "Assignment" && currentDay) {
          dueDateLookup[moduleItem.content.id] = dateRangeComputer(currentDay);
        }
      });
    });

    const validAssignments = assignments; //.filter(assignment => assignment.dueAt !== null);

    if (validAssignments.length > 0) {
      validAssignments.forEach(assignment => {
        const dueDate = assignment.dueAt !== null ? new Date(assignment.dueAt) : dueDateLookup[assignment.id];
        const submission = submissions.find(sub => sub.assignment?.id === assignment.id);
        
        const isSubmitted = !!(submission && 
          submission.submittedAt !== null && 
          submission.state !== 'unsubmitted');
          
        const submissionStatus = isSubmitted 
          ? `Submitted at: ${new Date(submission.submittedAt).toLocaleString()} [State: ${submission.state}]` 
          : 'NOT SUBMITTED';

        const gradeInfo = submission?.grade 
          ? `${submission.grade} (${submission.score} / ${assignment.pointsPossible} pts)` 
          : `Not Graded (Max: ${assignment.pointsPossible ?? 0} pts)`;

        const grade = submission?.grade ? 
          submission.score === assignment.pointsPossible ? 100.0 :
          (parseFloat(submission.score) / parseFloat(assignment.pointsPossible)) * 100.0 : 
          null;

        if (isSubmitted || grade > 50.0) {
          if (submission?.state === "submitted") {
            data.submitted.push({
              course: course.name, 
              isSubmitted,
              grade: null,
              assignment: assignment.name,
              due: dueDate,
              dateSubmitted: new Date(submission.submittedAt)
            });
          } else if (submission?.grade) {
            if (submission.state === "pending_review") {
              data.submitted.push({
                course: course.name, 
                isSubmitted,
                grade: null,
                assignment: assignment.name,
                due: dueDate,
                dateSubmitted: new Date(submission.submittedAt)
              });
            } else if (grade >= cutoff) {
              data.accepted.push({
                course: course.name, 
                isSubmitted,
                grade,
                assignment: assignment.name,
                due: dueDate,
                dateSubmitted: new Date(submission.submittedAt)
              });
            } else {
              data.redo.push({
                course: course.name, 
                isSubmitted,
                grade,
                assignment: assignment.name,
                due: dueDate,
                dateSubmitted: new Date(submission.submittedAt)
              });
            }
          } else {
            data.unknown.push({
              course: course.name, 
              isSubmitted,
              grade,
              assignment: assignment.name,
              due: dueDate,
              dateSubmitted: null
            });
          }
        } else if (submission?.excused) {
          data.notrequired.push({
            course: course.name, 
            isSubmitted,
            grade,
            assignment: assignment.name,
            due: dueDate,
            dateSubmitted: null
          });
        } else {
           if (dueDate && dueDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0] === now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0]) {
            data.due.push({
              course: course.name, 
              isSubmitted,
              grade,
              assignment: assignment.name,
              due: dueDate,
              dateSubmitted: null
            });
          } if (dueDate && dueDate.valueOf() < now.valueOf()) {
            data.late.push({
              course: course.name, 
              isSubmitted,
              grade,
              assignment: assignment.name,
              due: dueDate,
              dateSubmitted: null
            });
          } else {
            data.upcoming.push({
              course: course.name, 
              isSubmitted,
              grade,
              assignment: assignment.name,
              due: dueDate,
              dateSubmitted: null
            });
          }
        }
      });
    }
  }

  return data;
}
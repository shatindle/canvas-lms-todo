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
  if (!targetDayName) return null;

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const targetIndex = days.findIndex(day => day.toLowerCase() === targetDayName.toLowerCase());
  
  if (new Date(rangeStart).getDay() === 5 && new Date(rangeEnd).getDay() === 5)
    rangeStart = new Date(rangeStart.valueOf() + 3 * 24 * 60 * 60 * 1000 /*+ 23 * 60 * 60 * 1000*/);

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
  const weekOfDayMatch = text.match(/Week of (\d{1,2})\/(\d{1,2})\/(\d{4})/i);

  if (weekOfDayMatch) {
    const [_, month, day, year] = weekOfDayMatch;

    const startDate = new Date(`${month} ${day}, ${year}`);
    const endDate = new Date(startDate.valueOf() + 5 * 24 * 60 * 60 * 1000);

    if (text.toLowerCase().indexOf("week of") > -1) {
      const includesDaysOfWeekWithLessonCallout = [...text.matchAll(/((Lesson \d+).*?\((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\)/ig)];

      if (includesDaysOfWeekWithLessonCallout.length) {
        // this title includes days of the week.. our matching will have to become more sophisticated...
        /*
        * Example: 
        * Week of August 14-21, 2026 Unit 1 Lesson 3 Physical Map & Assignment (Tuesday); Unit 1 Lesson 4 & Assignment (Thursday)
        * U1: Lesson 3 Physical Map
        * U1: Lesson 3 Assignment
        * U1: Lesson 4 Road Map
        * U1: Lesson 4 Assignment
        */

        return function (day, text) {
          for (const subMatch of includesDaysOfWeekWithLessonCallout) {
            if (text.indexOf(subMatch[2]) > -1) {
              return getDateByDayName(startDate, endDate, subMatch[3]);
            }
          }

          return getDateByDayName(startDate, endDate, day);
        };
      }

      if (text.toLowerCase().indexOf("odd lesson") > -1 || text.toLowerCase().indexOf("even lesson") > -1) {
        const evenOddLookahead = [...text.matchAll(/(even|odd).*?(Monday|Mon|Tuesday|Tues|Wednesday|Wed|Thursday|Thurs|Friday|Fri|Saturday|Sat|Sunday|Sun)(\/(Monday|Mon|Tuesday|Tues|Wednesday|Wed|Thursday|Thurs|Friday|Fri|Saturday|Sat|Sunday|Sun))?(\/(Monday|Mon|Tuesday|Tues|Wednesday|Wed|Thursday|Thurs|Friday|Fri|Saturday|Sat|Sunday|Sun))?(\/(Monday|Mon|Tuesday|Tues|Wednesday|Wed|Thursday|Thurs|Friday|Fri|Saturday|Sat|Sunday|Sun))?(\/(Monday|Mon|Tuesday|Tues|Wednesday|Wed|Thursday|Thurs|Friday|Fri|Saturday|Sat|Sunday|Sun))?/ig)];
        // this title includes days of the week.. our matching will have to become more sophisticated...
        /*
        * Example: 
        * Week of 8/17/2026 Odd Lesson Days are Mon/Wed (Assignment to Submit) Even Lessons on Tues/Thurs (Complete Zearn Lesson only)
        * Lesson 5 <, >, or =? Assignment
        * Lesson 6 Pattern Spotter
        * Lesson 7 Round and Round
        * Lesson 7 Round and Round Assignment
        */

        const iter = {
          "even": 0,
          "odd": 0
        }

        const isEven = (num) => num % 2 === 0;

        return function (day, text, iterateCallCount = true) {
          const lessonNum = text.match(/Lesson (\d+)/ig);
          if (lessonNum) {
            const lessonNumber = parseInt(lessonNum[0].replace(/\D/g, ""));
            for (const subMatch of evenOddLookahead) {
              if (subMatch[1].toLowerCase() === "even" && isEven(lessonNumber) ||
                (subMatch[1].toLowerCase() === "odd" && !isEven(lessonNumber))) {
                  
                const localIter = (iter[subMatch[1].toLowerCase()] + 1) * 2;

                if (iterateCallCount) {
                  iter[subMatch[1].toLowerCase()] = iter[subMatch[1].toLowerCase()] + 1;
                }

                if (localIter < subMatch.length) {
                  let thisDay = subMatch[localIter];

                  if (thisDay === "Mon") thisDay = "Monday";
                  else if (thisDay === "Tues") thisDay = "Tuesday";
                  else if (thisDay === "Wed") thisDay = "Wednesday";
                  else if (thisDay === "Thurs") thisDay = "Thursday";
                  else if (thisDay === "Fri") thisDay = "Friday";
                  else if (thisDay === "Sat") thisDay = "Saturday";
                  else if (thisDay === "Sun") thisDay = "Sunday";

                  return getDateByDayName(startDate, endDate, thisDay);
                }
              }
            }
          }

          return getDateByDayName(startDate, endDate, day);
        };
      } else return (day) => getDateByDayName(startDate, endDate, day);
    }

    return (day) => getDateByDayName(startDate, endDate, day);
  }

  // Regex to capture month, start day, end day, and year
  const monthDayMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s(\d{1,2})-(\d{1,2}),\s(\d{4})/);

  if (monthDayMatch) {
    const [_, month, startDay, endDay, year] = monthDayMatch;
    
    // Create native JavaScript Date objects
    const startDate = new Date(`${month} ${startDay}, ${year}`);
    const endDate = new Date(`${month} ${endDay}, ${year}`);

    if (text.toLowerCase().indexOf("week of") > -1) {
      const includesDaysOfWeekWithLessonCallout = [...text.matchAll(/((Lesson \d+).*?\((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\)/ig)];

      if (includesDaysOfWeekWithLessonCallout.length) {
        // this title includes days of the week.. our matching will have to become more sophisticated...
        /*
        * Example: 
        * Week of August 14-21, 2026 Unit 1 Lesson 3 Physical Map & Assignment (Tuesday); Unit 1 Lesson 4 & Assignment (Thursday)
        * U1: Lesson 3 Physical Map
        * U1: Lesson 3 Assignment
        * U1: Lesson 4 Road Map
        * U1: Lesson 4 Assignment
        */

        return function (day, text) {
          for (const subMatch of includesDaysOfWeekWithLessonCallout) {
            if (text.indexOf(subMatch[2]) > -1) {
              return getDateByDayName(startDate, endDate, subMatch[3]);
            }
          }

          return getDateByDayName(startDate, endDate, day);
        };
      } 
      
      return (day) => getDateByDayName(startDate, endDate, day);
    }

    return (day) => getDateByDayName(startDate, endDate, day);
  }

  const dueDaynameMonthDay = text.match(/due (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})/i);

  if (dueDaynameMonthDay) {
    const [_, dayname, month, day] = dueDaynameMonthDay;

    const startDate = new Date(`${month} ${day}, ${new Date().getFullYear()}`);

    return () => startDate;
  }

  const monthDayYearMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (monthDayYearMatch && !text.match(/Update on (\d{1,2})\/(\d{1,2})\/(\d{4})/i)) {
    const [_, month, day, year] = monthDayYearMatch;

    const startDate = new Date(`${month} ${day}, ${year}`);

    return () => startDate;
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

    let currentDay = null;

    modules.forEach(module => {
      let dateRangeComputer = extractDateRange(module.name);

      // sometimes we shouldn't clear this...
      if (module.name.indexOf("Unit ") === 0)
        currentDay = null;

      module.moduleItemsConnection?.nodes.forEach(moduleItem => {
        const dayMatch = moduleItem.title.match(/\((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\)/i);
        const dateMatch = moduleItem.title.match(/\d{1,2}\/\d{1,2}\/\d{4}/);

        let moreSpecificDateComputer = extractDateRange(moduleItem.title);

        if (dayMatch) currentDay = dayMatch[1];
        else if (dateMatch) currentDay = dateMatch[0];

        if (moreSpecificDateComputer("Monday", moduleItem.title, false) !== null) 
          dateRangeComputer = moreSpecificDateComputer;
        
        if (moduleItem.content.__typename === "Assignment" && currentDay) { 
          dueDateLookup[moduleItem.content.id] = dateRangeComputer(currentDay, moduleItem.title, false) === null ? new Date(currentDay) : dateRangeComputer(currentDay, moduleItem.title);
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
        } else if (assignment.pointsPossible === 0 || assignment.name.toLowerCase().indexOf("optional") > -1) {
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
          } else if (dueDate && dueDate.valueOf() < now.valueOf()) {
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
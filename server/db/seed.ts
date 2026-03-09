import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import sequelize from './config.js';
import {
  User,
  Candidate,
  CvFile,
  CandidateMatrix,
  Job,
  JobMatrix,
  Match,
  AdminNote,
  CandidateTag,
  CompanyProfile,
  PipelineStage,
} from './models/index.js';
import { randomUUID } from 'crypto';

dotenv.config();

const SEED_ENABLED = process.env.SEED_ENABLED === 'true';
const SEED_USERS = parseInt(process.env.SEED_USERS || '1', 10);
const SEED_JOBS = parseInt(process.env.SEED_JOBS || '5', 10);
const SEED_CANDIDATES = parseInt(process.env.SEED_CANDIDATES || '10', 10);

async function seed() {
  if (!SEED_ENABLED) {
    console.log('Seeding is disabled. Set SEED_ENABLED=true to enable.');
    return;
  }

  try {
    console.log('Starting database seeding...');

    // Authenticate database connection (skip sync since tables already exist)
    await sequelize.authenticate();

    // Seed Users
    if (SEED_USERS > 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.findOrCreate({
        where: { username: 'admin' },
        defaults: {
          id: randomUUID(),
          username: 'admin',
          password: hashedPassword,
          role: 'admin',
          email: 'admin@example.com',
          name: 'Admin User',
        },
      });

      console.log(`✓ Seeded ${SEED_USERS} user(s)`);
    }

    // Seed Candidates
    if (SEED_CANDIDATES > 0) {
      const candidates = [];
      for (let i = 0; i < SEED_CANDIDATES; i++) {
        const candidate = await Candidate.create({
          id: randomUUID(),
          name: `Candidate ${i + 1}`,
          email: `candidate${i + 1}@example.com`,
          phone: `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
          country: 'US',
          country_code: 'US',
          headline: `Senior Software Engineer ${i + 1}`,
        });

        // Create CV file
        const cvFile = await CvFile.create({
          id: randomUUID(),
          candidate_id: candidate.id,
          filename: `candidate_${i + 1}_cv.pdf`,
          file_path: `./uploads/cvs/candidate_${i + 1}_cv.pdf`,
          file_size: 100000 + Math.floor(Math.random() * 400000),
          status: 'matrix_ready',
          batch_tag: 'Seed Batch',
        });

        // Create matrix
        await CandidateMatrix.create({
          id: randomUUID(),
          candidate_id: candidate.id,
          cv_file_id: cvFile.id,
          skills: [
            { name: 'JavaScript', level: 'advanced', yearsOfExperience: 5 },
            { name: 'TypeScript', level: 'intermediate', yearsOfExperience: 3 },
          ],
          roles: ['Software Engineer'],
          total_years_experience: 5 + i,
          domains: ['SaaS'],
          education: [{ degree: 'BSc Computer Science', institution: 'University', year: 2015 }],
          languages: [{ language: 'English', proficiency: 'Native' }],
          location_signals: {
            currentCountry: 'US',
            willingToRelocate: true,
            preferredLocations: ['US', 'UK'],
          },
          confidence: 85,
          evidence: [],
          qwen_model_version: 'qwen-2.5',
        });

        candidates.push(candidate);
      }
      console.log(`✓ Seeded ${SEED_CANDIDATES} candidate(s)`);
    }

    // Seed Jobs
    if (SEED_JOBS > 0) {
      const jobs = [];
      
      const jobTemplates = [
        {
          title: 'Senior Frontend Engineer',
          department: 'Engineering',
          locationType: 'remote' as const,
          country: 'US',
          city: 'San Francisco',
          description: `About the role

We are looking for a Senior Frontend Engineer to own the user-facing side of our product. You will build scalable, accessible web applications and work closely with design and backend teams to ship features that our users love.

Responsibilities:

- Design and implement new features and pages using React, TypeScript, and our design system
- Improve performance, accessibility, and SEO of our frontend applications
- Collaborate with product and design to refine requirements and translate mockups into code
- Mentor junior engineers and participate in code reviews and technical design discussions
- Own the frontend release pipeline and work with QA to ensure high quality

Requirements:

- 5+ years of experience building production web applications
- Strong proficiency in JavaScript/TypeScript, React, HTML/CSS, and modern build tools
- Experience with state management, testing (Jest, React Testing Library), and CI/CD
- Solid understanding of web performance, accessibility standards, and cross-browser compatibility
- Clear communication and ability to work in a distributed team

What we offer:

- Remote-first culture with flexible hours
- Competitive salary and equity
- Health, dental, and vision insurance
- Learning budget and conference attendance`,
          mustHaveSkills: ['JavaScript', 'TypeScript', 'React', 'HTML/CSS'],
          niceToHaveSkills: ['Next.js', 'GraphQL', 'Webpack', 'Jest'],
          minYearsExperience: 5,
          seniorityLevel: 'senior' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'JavaScript', weight: 90 },
            { skill: 'TypeScript', weight: 85 },
            { skill: 'React', weight: 80 },
            { skill: 'HTML/CSS', weight: 75 },
          ],
          preferredSkills: [
            { skill: 'Next.js', weight: 60 },
            { skill: 'GraphQL', weight: 50 },
          ],
        },
        {
          title: 'Backend Developer',
          department: 'Engineering',
          locationType: 'hybrid' as const,
          country: 'US',
          city: 'New York',
          description: `About the role

Join our backend team to design and implement robust APIs and microservices that power our platform. You will work with Node.js, Python, and cloud technologies to build scalable, reliable systems.

Responsibilities:

- Design, develop, and maintain RESTful and GraphQL APIs used by our web and mobile clients
- Build and operate microservices; participate in on-call rotation and incident response
- Write clear documentation and runbooks; collaborate with frontend and platform teams
- Improve database performance, caching, and query patterns
- Contribute to technical decisions and architecture reviews

Requirements:

- 3+ years of backend development experience
- Proficiency in Node.js and/or Python; experience with SQL and NoSQL databases
- Understanding of REST API design, authentication, and security best practices
- Experience with cloud platforms (AWS, GCP, or Azure) and containerization (Docker)
- Strong problem-solving skills and attention to detail

Nice to have:

- Experience with message queues, event-driven systems, or stream processing
- Knowledge of DevOps practices and infrastructure as code`,
          mustHaveSkills: ['Node.js', 'Python', 'REST APIs', 'Database Design'],
          niceToHaveSkills: ['PostgreSQL', 'MongoDB', 'Docker', 'AWS'],
          minYearsExperience: 3,
          seniorityLevel: 'mid' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'Node.js', weight: 85 },
            { skill: 'Python', weight: 80 },
            { skill: 'REST APIs', weight: 85 },
            { skill: 'Database Design', weight: 75 },
          ],
          preferredSkills: [
            { skill: 'PostgreSQL', weight: 70 },
            { skill: 'AWS', weight: 60 },
          ],
        },
        {
          title: 'Full Stack Engineer',
          department: 'Engineering',
          locationType: 'remote' as const,
          country: 'UK',
          city: 'London',
          description: `About the role

We need a versatile Full Stack Engineer who can own features from database to UI. You will work with modern technologies and best practices to ship end-to-end functionality.

Responsibilities:

- Build and ship full-stack features: APIs, business logic, and React-based UIs
- Participate in planning, estimation, and code reviews; help improve our stack and tooling
- Debug production issues and improve observability, logging, and testing
- Work with product and design to clarify requirements and deliver on time

Requirements:

- 4+ years of experience with JavaScript/TypeScript, Node.js, React, and SQL
- Experience designing APIs and data models; comfortable with both frontend and backend
- Familiarity with testing, version control, and deployment pipelines
- Strong communication skills and ability to work in a remote team

What we offer:

- Remote work within the UK; flexible schedule
- Pension contribution and private health insurance
- Annual learning budget and team offsites`,
          mustHaveSkills: ['JavaScript', 'Node.js', 'React', 'SQL'],
          niceToHaveSkills: ['TypeScript', 'PostgreSQL', 'GraphQL', 'Docker'],
          minYearsExperience: 4,
          seniorityLevel: 'senior' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'JavaScript', weight: 85 },
            { skill: 'Node.js', weight: 80 },
            { skill: 'React', weight: 75 },
            { skill: 'SQL', weight: 70 },
          ],
          preferredSkills: [
            { skill: 'TypeScript', weight: 65 },
            { skill: 'PostgreSQL', weight: 60 },
          ],
        },
        {
          title: 'DevOps Engineer',
          department: 'Infrastructure',
          locationType: 'hybrid' as const,
          country: 'US',
          city: 'Seattle',
          description: 'Help us build and maintain our cloud infrastructure. You will work with CI/CD pipelines, containerization, and cloud platforms to ensure reliable deployments.',
          mustHaveSkills: ['Docker', 'Kubernetes', 'CI/CD', 'Linux'],
          niceToHaveSkills: ['AWS', 'Terraform', 'Jenkins', 'Monitoring'],
          minYearsExperience: 4,
          seniorityLevel: 'senior' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'Docker', weight: 90 },
            { skill: 'Kubernetes', weight: 85 },
            { skill: 'CI/CD', weight: 80 },
            { skill: 'Linux', weight: 75 },
          ],
          preferredSkills: [
            { skill: 'AWS', weight: 70 },
            { skill: 'Terraform', weight: 65 },
          ],
        },
        {
          title: 'Data Engineer',
          department: 'Data',
          locationType: 'onsite' as const,
          country: 'US',
          city: 'Boston',
          description: 'Build and maintain our data pipelines and infrastructure. You will work with large datasets, ETL processes, and data warehousing solutions.',
          mustHaveSkills: ['Python', 'SQL', 'ETL', 'Data Warehousing'],
          niceToHaveSkills: ['Spark', 'Airflow', 'Snowflake', 'AWS'],
          minYearsExperience: 3,
          seniorityLevel: 'mid' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'Python', weight: 85 },
            { skill: 'SQL', weight: 90 },
            { skill: 'ETL', weight: 80 },
            { skill: 'Data Warehousing', weight: 75 },
          ],
          preferredSkills: [
            { skill: 'Spark', weight: 70 },
            { skill: 'Airflow', weight: 65 },
          ],
        },
        {
          title: 'Junior Software Engineer',
          department: 'Engineering',
          locationType: 'hybrid' as const,
          country: 'US',
          city: 'Austin',
          description: 'Great opportunity for a junior engineer to grow their skills. You will work on real projects, learn from experienced developers, and contribute to our product.',
          mustHaveSkills: ['JavaScript', 'HTML/CSS', 'Git'],
          niceToHaveSkills: ['React', 'Node.js', 'TypeScript'],
          minYearsExperience: 0,
          seniorityLevel: 'junior' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'JavaScript', weight: 80 },
            { skill: 'HTML/CSS', weight: 75 },
            { skill: 'Git', weight: 70 },
          ],
          preferredSkills: [
            { skill: 'React', weight: 60 },
            { skill: 'Node.js', weight: 55 },
          ],
        },
        {
          title: 'Lead Software Architect',
          department: 'Engineering',
          locationType: 'remote' as const,
          country: 'US',
          city: 'Remote',
          description: 'Lead our technical architecture and design decisions. You will work with cross-functional teams to design scalable systems and mentor other engineers.',
          mustHaveSkills: ['System Design', 'Architecture', 'Leadership', 'Cloud Architecture'],
          niceToHaveSkills: ['Microservices', 'Event-Driven Architecture', 'AWS', 'Kubernetes'],
          minYearsExperience: 8,
          seniorityLevel: 'lead' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'System Design', weight: 95 },
            { skill: 'Architecture', weight: 90 },
            { skill: 'Leadership', weight: 85 },
            { skill: 'Cloud Architecture', weight: 80 },
          ],
          preferredSkills: [
            { skill: 'Microservices', weight: 75 },
            { skill: 'AWS', weight: 70 },
          ],
        },
        {
          title: 'Mobile Developer (React Native)',
          department: 'Engineering',
          locationType: 'hybrid' as const,
          country: 'US',
          city: 'Los Angeles',
          description: 'Build beautiful mobile applications using React Native. You will work on both iOS and Android platforms, creating seamless user experiences.',
          mustHaveSkills: ['React Native', 'JavaScript', 'Mobile Development', 'REST APIs'],
          niceToHaveSkills: ['TypeScript', 'Redux', 'Native Modules', 'App Store'],
          minYearsExperience: 3,
          seniorityLevel: 'mid' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'React Native', weight: 90 },
            { skill: 'JavaScript', weight: 85 },
            { skill: 'Mobile Development', weight: 80 },
            { skill: 'REST APIs', weight: 75 },
          ],
          preferredSkills: [
            { skill: 'TypeScript', weight: 70 },
            { skill: 'Redux', weight: 65 },
          ],
        },
        {
          title: 'QA Automation Engineer',
          department: 'Quality Assurance',
          locationType: 'remote' as const,
          country: 'US',
          city: 'Remote',
          description: 'Design and implement automated testing solutions. You will work with testing frameworks, CI/CD integration, and help ensure product quality.',
          mustHaveSkills: ['Test Automation', 'Selenium', 'JavaScript', 'API Testing'],
          niceToHaveSkills: ['Cypress', 'Playwright', 'CI/CD', 'Performance Testing'],
          minYearsExperience: 2,
          seniorityLevel: 'mid' as const,
          status: 'published' as const,
          requiredSkills: [
            { skill: 'Test Automation', weight: 85 },
            { skill: 'Selenium', weight: 80 },
            { skill: 'JavaScript', weight: 75 },
            { skill: 'API Testing', weight: 70 },
          ],
          preferredSkills: [
            { skill: 'Cypress', weight: 65 },
            { skill: 'CI/CD', weight: 60 },
          ],
        },
        {
          title: 'Product Manager',
          department: 'Product',
          locationType: 'hybrid' as const,
          country: 'US',
          city: 'Chicago',
          description: 'Drive product strategy and execution. You will work with engineering, design, and stakeholders to deliver products that users love.',
          mustHaveSkills: ['Product Management', 'Agile', 'Analytics', 'Stakeholder Management'],
          niceToHaveSkills: ['Technical Background', 'Data Analysis', 'User Research', 'Roadmapping'],
          minYearsExperience: 4,
          seniorityLevel: 'senior' as const,
          status: 'draft' as const,
          requiredSkills: [
            { skill: 'Product Management', weight: 90 },
            { skill: 'Agile', weight: 85 },
            { skill: 'Analytics', weight: 80 },
            { skill: 'Stakeholder Management', weight: 75 },
          ],
          preferredSkills: [
            { skill: 'Technical Background', weight: 70 },
            { skill: 'Data Analysis', weight: 65 },
          ],
        },
      ];

      // Update existing jobs with full descriptions (run first so it works even if create below fails)
      for (const template of jobTemplates) {
        const [updated] = await Job.update(
          { description: template.description },
          { where: { title: template.title } }
        );
        if (updated > 0) {
          console.log(`✓ Updated description for existing job: ${template.title}`);
        }
      }

      for (let i = 0; i < SEED_JOBS; i++) {
        const template = jobTemplates[i % jobTemplates.length];
        const variation = Math.floor(i / jobTemplates.length);
        
        const job = await Job.create({
          id: randomUUID(),
          title: variation > 0 ? `${template.title} (${variation + 1})` : template.title,
          department: template.department,
          location_type: template.locationType,
          country: template.country,
          city: template.city,
          description: template.description,
          must_have_skills: template.mustHaveSkills,
          nice_to_have_skills: template.niceToHaveSkills,
          min_years_experience: template.minYearsExperience,
          seniority_level: template.seniorityLevel,
          status: template.status,
        });

        // Create job matrix
        await JobMatrix.create({
          id: randomUUID(),
          job_id: job.id,
          required_skills: template.requiredSkills,
          preferred_skills: template.preferredSkills,
          experience_weight: 25,
          location_weight: template.locationType === 'remote' ? 10 : 20,
          domain_weight: 15,
          qwen_model_version: 'qwen-2.5',
        });

        jobs.push(job);
      }
      console.log(`✓ Seeded ${SEED_JOBS} job(s) with diverse data`);
    }

    // Seed default pipeline stages for all existing company profiles
    const companyProfiles = await CompanyProfile.findAll();
    const DEFAULT_STAGES = [
      { name: 'Applied', order: 0, color: '#6B7280', is_default: true },
      { name: 'Screening', order: 1, color: '#3B82F6', is_default: true },
      { name: 'Interview', order: 2, color: '#8B5CF6', is_default: true },
      { name: 'Offer', order: 3, color: '#F59E0B', is_default: true },
      { name: 'Hired', order: 4, color: '#10B981', is_default: true },
      { name: 'Rejected', order: 5, color: '#EF4444', is_default: true },
    ];

    for (const cp of companyProfiles) {
      const existingStages = await PipelineStage.count({ where: { company_id: cp.id } });
      if (existingStages === 0) {
        for (const stage of DEFAULT_STAGES) {
          await PipelineStage.create({
            id: randomUUID(),
            company_id: cp.id,
            name: stage.name,
            order: stage.order,
            color: stage.color,
            is_default: stage.is_default,
          });
        }
        console.log(`✓ Seeded default pipeline stages for company: ${cp.company_name}`);
      }
    }

    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();

"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { HeaderBar } from "@/components/header-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCoursesQuery } from "@/hooks/api/useCoursesQuery";
import {
  useAddPlannedCourseMutation,
  useUpdatePlanMutation,
} from "@/hooks/api/usePlanQuery";
import { usePlannerStore } from "@/hooks/usePlannerStore";
import type { Course, CoursePrerequisite } from "@/lib/types";
import { Search, Filter, Plus, BookOpen, X } from "lucide-react";
import { toast } from "sonner";
import PrerequisiteGraph from "@/components/CourseCatalog/PrerequisiteGraph";
import { useSearchParams } from "next/navigation";

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [filters, setFilters] = useState({
    subject: "All subjects",
    level: "All levels",
    quarter: "All quarters",
    status: "All statuses",
  });

  const { data: courses = [], isLoading } = useCoursesQuery();
  const {
    addPlannedCourse,
    removePlannedCourse,
    currentPlanId,
    plans: localPlans,
  } = usePlannerStore();

  const activePlan = currentPlanId
    ? localPlans.find((p) => p.id === currentPlanId)
    : localPlans[0];

  const addPlannedCourseMutation = useAddPlannedCourseMutation();
  const updatePlanMutation = useUpdatePlanMutation();

  const searchParams = useSearchParams();

  const detailRef = useRef<HTMLDivElement | null>(null);

  // Effect: if ?course=CODE in query, auto-select that course once catalog loaded
  useEffect(() => {
    const codeParam = searchParams.get("course");
    if (codeParam && courses.length) {
      const match = courses.find((c) => c.code === codeParam);
      if (match) setSelectedCourse(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, courses]);

  // Scroll into view & pulse highlight when selectedCourse changes
  useEffect(() => {
    if (selectedCourse && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      detailRef.current.classList.add("ring-2", "ring-scu-cardinal");
      const timer = setTimeout(() => {
        detailRef.current?.classList.remove("ring-2", "ring-scu-cardinal");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [selectedCourse]);

  // Gather codes already planned (from local store for immediate reactivity)
  const plannedCourseCodes = new Set<string>();
  if (activePlan) {
    activePlan.quarters.forEach((q) => {
      q.courses.forEach((c) => plannedCourseCodes.add(c.courseCode));
    });
  }

  const handleAddToPlan = async () => {
    if (!selectedCourse || !activePlan) return;

    // Ensure the plan has at least one quarter
    let targetQuarterId = activePlan.quarters[0]?.id ?? "";
    if (!targetQuarterId) {
      toast.error("This plan has no quarters. Please create a quarter first.");
      return;
    }

    // If there are multiple quarters, ask which one; default to first.
    if (activePlan.quarters.length > 1) {
      const input = window.prompt(
        `Enter quarter ID to add this course. Available: ${activePlan.quarters
          .map((q) => q.id)
          .join(", ")}`,
        targetQuarterId
      );
      if (input) targetQuarterId = input;
    }

    if (!targetQuarterId) return;

    // Optimistic local update
    addPlannedCourse(selectedCourse.code ?? "", targetQuarterId);

    // Persist to backend
    await addPlannedCourseMutation.mutateAsync({
      planId: activePlan.id!,
      courseCode: selectedCourse.code ?? "",
      quarter: targetQuarterId,
    });

    toast.success(`Added ${selectedCourse.code} to plan`);
  };

  const handleRemoveFromPlan = async () => {
    if (!selectedCourse || !activePlan) return;

    const courseCode = selectedCourse.code ?? "";

    // Find the quarter containing the course
    const quarterWithCourse = activePlan.quarters.find((q) =>
      q.courses.some((c) => c.courseCode === courseCode)
    );

    if (!quarterWithCourse) return;

    // Optimistic local update
    removePlannedCourse(courseCode, quarterWithCourse.id);

    // Build updated quarters payload (remove the course)
    const updatedQuarters = activePlan.quarters.map((q) =>
      q.id === quarterWithCourse.id
        ? {
            ...q,
            courses: q.courses.filter((c) => c.courseCode !== courseCode),
          }
        : q
    );

    try {
      await updatePlanMutation.mutateAsync({
        planId: activePlan.id!,
        updates: { quarters: updatedQuarters },
      });
      toast.success(`Removed ${courseCode} from plan`);
    } catch {
      // revert optimistic change on error
      addPlannedCourse(courseCode, quarterWithCourse.id);
    }
  };

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      (course.code ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (course.title ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject =
      filters.subject === "All subjects" || course.subject === filters.subject;
    const matchesLevel =
      filters.level === "All levels" ||
      (course.level ?? 0).toString() === filters.level;
    const matchesQuarter =
      filters.quarter === "All quarters" ||
      course.quarters?.includes(filters.quarter);
    const matchesStatus =
      filters.status === "All statuses" || course.status === filters.status;

    return (
      matchesSearch &&
      matchesSubject &&
      matchesLevel &&
      matchesQuarter &&
      matchesStatus
    );
  });

  const prereqLabels = useMemo<{ labels: string[] }>(() => {
    const prereqs = selectedCourse?.prerequisites;
    if (!prereqs || prereqs.length === 0) return { labels: [] };

    // Build alias -> group mapping from crossListedAs in full catalog
    const aliasToGroup: Record<string, string[]> = {};
    courses.forEach((c) => {
      if (c.crossListedAs && c.crossListedAs.length) {
        const grp = [c.code!, ...c.crossListedAs];
        grp.forEach((alias) => (aliasToGroup[alias] = grp));
      }
    });

    const labelSet = new Set<string>();

    prereqs.forEach((g: CoursePrerequisite) => {
      g.courses.forEach((code: string) => {
        const groupArr = aliasToGroup[code] ?? [code];
        labelSet.add(groupArr.join("/"));
      });
    });

    return { labels: Array.from(labelSet) };
  }, [courses, selectedCourse]);

  const subjects = Array.from(new Set(courses.map((c) => c.subject)));
  const levels = Array.from(
    new Set(courses.map((c) => (c.level ?? 0).toString()))
  );
  const quarters = ["Fall", "Winter", "Spring", "Summer"];
  const statuses = ["available", "closed", "waitlist"];

  return (
    <div className="flex">
      <SidebarNav />
      <div className="flex-1">
        <HeaderBar title="Course Catalog" />

        <main className="p-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Search and Filters */}
            <div className="lg:w-2/3 space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search courses by code or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline">
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Filter Courses</SheetTitle>
                      <SheetDescription>
                        Narrow down your course search
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 mt-6">
                      <div>
                        <label className="text-sm font-medium">Subject</label>
                        <Select
                          value={filters.subject}
                          onValueChange={(value) =>
                            setFilters((prev) => ({ ...prev, subject: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All subjects" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All subjects">
                              All subjects
                            </SelectItem>
                            {subjects.map((subject) => (
                              <SelectItem
                                key={subject ?? "unknown"}
                                value={subject ?? "unknown"}
                              >
                                {subject ?? "Unknown"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Level</label>
                        <Select
                          value={filters.level}
                          onValueChange={(value) =>
                            setFilters((prev) => ({ ...prev, level: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All levels" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All levels">
                              All levels
                            </SelectItem>
                            {levels.map((level) => (
                              <SelectItem key={level} value={level}>
                                Level {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium">
                          Quarter Offered
                        </label>
                        <Select
                          value={filters.quarter}
                          onValueChange={(value) =>
                            setFilters((prev) => ({ ...prev, quarter: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All quarters" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All quarters">
                              All quarters
                            </SelectItem>
                            {quarters.map((quarter) => (
                              <SelectItem key={quarter} value={quarter}>
                                {quarter}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Status</label>
                        <Select
                          value={filters.status}
                          onValueChange={(value) =>
                            setFilters((prev) => ({ ...prev, status: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All statuses">
                              All statuses
                            </SelectItem>
                            {statuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status.charAt(0).toUpperCase() +
                                  status.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Results */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {isLoading
                    ? "Loading..."
                    : `${filteredCourses.length} courses found`}
                </p>
                {filteredCourses.map((course: Course) => {
                  const isPlanned = plannedCourseCodes.has(course.code ?? "");
                  return (
                    <Card
                      key={course.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedCourse(course)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-scu-cardinal">
                                {course.code}
                              </h3>
                              <Badge variant="secondary">{course.units}u</Badge>
                              <Badge
                                variant={
                                  course.status === "available"
                                    ? "default"
                                    : "destructive"
                                }
                              >
                                {course.status}
                              </Badge>
                              {isPlanned && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-700 border-green-300"
                                >
                                  In Plan
                                </Badge>
                              )}
                            </div>
                            <h4 className="font-medium mb-1">{course.title}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {course.description}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {course.quarters?.map((quarter: string) => (
                                <Badge
                                  key={quarter}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {quarter}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Course Detail Panel */}
            <div className="lg:w-1/3">
              {selectedCourse ? (
                <Card className="sticky top-6" ref={detailRef}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-scu-cardinal">
                        {selectedCourse.code}
                      </CardTitle>
                      <Badge variant="secondary">
                        {selectedCourse.units} units
                      </Badge>
                    </div>
                    <CardDescription>{selectedCourse.title}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h5 className="font-medium mb-2">Description</h5>
                      <p className="text-sm text-muted-foreground">
                        {selectedCourse.description}
                      </p>
                    </div>

                    {(selectedCourse.prerequisites?.length ?? 0) > 0 && (
                      <div>
                        <h5 className="font-medium mb-2">Prerequisites</h5>
                        <div className="flex flex-wrap gap-1 mb-4">
                          {prereqLabels.labels.map((label: string) => (
                            <Badge key={label} variant="outline">
                              {label}
                            </Badge>
                          ))}
                        </div>
                        <PrerequisiteGraph
                          courseCode={selectedCourse.code ?? ""}
                        />
                      </div>
                    )}

                    {(selectedCourse.geCategories?.length ?? 0) > 0 && (
                      <div>
                        <h5 className="font-medium mb-2">GE Categories</h5>
                        <div className="flex flex-wrap gap-1">
                          {selectedCourse.geCategories?.map((category) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h5 className="font-medium mb-2">Quarters Offered</h5>
                      <div className="flex flex-wrap gap-1">
                        {selectedCourse.quarters?.map((quarter: string) => (
                          <Badge key={quarter} variant="outline">
                            {quarter}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      className="w-full scu-gradient text-white"
                      onClick={handleAddToPlan}
                      disabled={
                        !activePlan ||
                        plannedCourseCodes.has(selectedCourse.code ?? "")
                      }
                    >
                      {plannedCourseCodes.has(selectedCourse.code ?? "") ? (
                        "Added"
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" /> Add to Plan
                        </>
                      )}
                    </Button>

                    {plannedCourseCodes.has(selectedCourse.code ?? "") && (
                      <Button
                        variant="outline"
                        className="w-full mt-2"
                        onClick={handleRemoveFromPlan}
                        disabled={!activePlan}
                      >
                        <X className="h-4 w-4 mr-2" /> Remove from Plan
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="sticky top-6" ref={detailRef}>
                  <CardContent className="p-8 text-center">
                    <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Select a course to view details
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

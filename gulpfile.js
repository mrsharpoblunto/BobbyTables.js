var gulp = require('gulp');

var del = require('del');
var uglify = require('gulp-uglify');
var browserify = require('gulp-browserify');
var rename = require('gulp-rename');

gulp.task('clean',function(cb) {
	del(['dist'],cb);
});

gulp.task('build',['clean'],function() {
	return gulp.src('lib/index.js')
		.pipe(browserify({standalone:'BobbyTables'}))
		.pipe(uglify())
		.pipe(rename('bobbytables.js'))
		.pipe(gulp.dest('dist'));
});

gulp.task('watch',function() {
	gulp.watch('lib/**/*', ['build']);
});

gulp.task('default',['build']);

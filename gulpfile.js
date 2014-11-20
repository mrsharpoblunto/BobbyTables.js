var gulp = require('gulp');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var packageJSON = require('./package');
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

gulp.task('lint',function() {
    return gulp.src('lib/**/*.js')
        .pipe(jshint(packageJSON.jshintConfig))
        .pipe(jshint.reporter(stylish));
});

gulp.task('watch',function() {
	gulp.watch('lib/**/*', ['lint','build']);
});

gulp.task('default',['lint','build']);
